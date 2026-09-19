import { DurableObject } from 'cloudflare:workers';
import {
  CompositeEmitter,
  Gateway,
  RoomManager,
  generatePlayerId,
  type ConnectionContext,
  type Logger,
  type PushPayload,
  type OwnedEmitter,
  type Scheduler,
} from '@uno/core';
import { DEFAULT_OPTIONS } from '@uno/engine';
import {
  MAX_MESSAGE_BYTES,
  reqEnvelopeSchema,
  type PushEnvelope,
  type ResEnvelope,
  type ServerToClientEvents,
} from '@uno/protocol';

/** Cierre por violacion de protocolo. */
const CLOSE_POLICY = 1008;

export interface Env {
  ROOM: DurableObjectNamespace<RoomDurableObject>;
  CLIENT_ORIGIN?: string;
}

/**
 * Logger a consola. pino no corre en Workers (depende de worker_threads y de
 * los streams de Node), pero la interfaz `Logger` ya era la abstraccion
 * correcta: los call sites no cambian.
 */
const consoleLogger: Logger = {
  info: (obj, msg) => console.log(JSON.stringify({ level: 'info', msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ level: 'warn', msg, ...obj })),
  error: (obj, msg) => console.error(JSON.stringify({ level: 'error', msg, ...obj })),
};

/** Emitter sobre los WebSockets que este DO tiene abiertos. */
class DoEmitter implements OwnedEmitter {
  private readonly sockets = new Map<string, WebSocket>();

  owns(connectionId: string): boolean {
    return this.sockets.has(connectionId);
  }

  add(connectionId: string, socket: WebSocket): void {
    this.sockets.set(connectionId, socket);
  }

  remove(connectionId: string): void {
    this.sockets.delete(connectionId);
  }

  push<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    data: PushPayload<E>,
  ): void {
    const socket = this.sockets.get(connectionId);
    if (!socket) return;
    const envelope: PushEnvelope = { t: 'push', ev: event, d: data };
    try {
      socket.send(JSON.stringify(envelope));
    } catch {
      // El socket se cerro entre medio: lo olvidamos y seguimos.
      this.sockets.delete(connectionId);
    }
  }
}

/**
 * Scheduler sobre la Alarms API.
 *
 * `setTimeout` en un DO es directamente incorrecto: el objeto se evicta cuando
 * queda idle, y quedar idle es exactamente lo que pasa cuando un jugador NO
 * juega — que es el caso que el timeout de turno existe para resolver. Con
 * setTimeout, el timeout fallaria SIEMPRE que importa y funcionaria solo
 * cuando no hace falta.
 *
 * Un DO tiene UNA sola alarm, pero como hay un DO por sala, esa dimension
 * desaparece: solo hay que multiplexar los deadlines de esta sala.
 */
class AlarmScheduler implements Scheduler {
  private deadline: number | null = null;

  constructor(private readonly ctx: DurableObjectState) {}

  schedule(_roomId: string, deadline: number, _now: number): void {
    this.deadline = deadline;
    void this.ctx.storage.setAlarm(deadline);
  }

  cancel(_roomId: string): void {
    this.deadline = null;
    void this.ctx.storage.deleteAlarm();
  }

  cancelAll(): void {
    this.cancel('');
  }

  get pendingDeadline(): number | null {
    return this.deadline;
  }
}

/**
 * Una sala = un Durable Object.
 *
 * El RoomManager vive adentro sin cambios: fue diseñado para no conocer
 * sockets y para tomar `now` por parametro, asi que corre igual aca que en
 * Node. Es la validacion retroactiva de esa decision.
 *
 * El estado en memoria es la fuente de verdad mientras el objeto vive. No
 * serializamos el GameState en cada mensaje: mientras haya WebSockets
 * abiertos el DO se mantiene, y si se evicta, los clientes reconectan y
 * reclaman su asiento con el token.
 */
export class RoomDurableObject extends DurableObject<Env> {
  private readonly rooms: RoomManager;
  private readonly gateway: Gateway;
  private readonly emitter = new DoEmitter();
  private readonly scheduler: AlarmScheduler;
  /** connectionId por socket, para el handler de cierre. */
  private readonly contexts = new Map<WebSocket, ConnectionContext>();
  private roomId: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.rooms = new RoomManager({
      reconnectGraceMs: 120_000,
      roomTtlMs: 3_600_000,
      options: DEFAULT_OPTIONS,
    });

    this.scheduler = new AlarmScheduler(ctx);

    const composite = new CompositeEmitter();
    composite.register(this.emitter);

    this.gateway = new Gateway({
      emitter: composite,
      rooms: this.rooms,
      scheduler: this.scheduler,
      logger: consoleLogger,
      now: () => Date.now(),
    });
  }

  /**
   * Reclama el codigo de sala.
   *
   * El DO ES el registro: `idFromName(codigo)` siempre devuelve el mismo
   * objeto, asi que cada sala es su propio guardian de unicidad, sin estado
   * compartido. Y como un DO es single-threaded, dos claims simultaneos del
   * mismo codigo se serializan solos.
   */
  async claim(roomId: string): Promise<boolean> {
    // Reclamar NO crea la sala: la sala se crea cuando el primer jugador manda
    // room:create por el WebSocket. Por eso hay que marcar el codigo aparte —
    // mirar `rooms.size` dejaria pasar un segundo claim del mismo codigo.
    const taken = await this.ctx.storage.get<boolean>('claimed');
    if (taken) return false;

    await this.ctx.storage.put('claimed', true);
    this.roomId = roomId;
    return true;
  }

  /** Si este codigo de sala ya fue reclamado. */
  async exists(): Promise<boolean> {
    return (await this.ctx.storage.get<boolean>('claimed')) === true;
  }

  override async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return new Response('se esperaba un upgrade a websocket', { status: 426 });
    }

    const url = new URL(request.url);
    const roomId = url.searchParams.get('room');
    if (roomId) this.roomId = roomId;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();

    const ctx: ConnectionContext = {
      connectionId: generatePlayerId(),
      playerId: null,
      roomId: null,
      playerToken: null,
      // La identidad del DO YA fija el codigo: el manager tiene que usar ese.
      ...(this.roomId ? { forcedRoomId: this.roomId } : {}),
    };
    this.contexts.set(server, ctx);
    this.emitter.add(ctx.connectionId, server);

    server.addEventListener('message', (event) => {
      void this.onMessage(server, ctx, event.data);
    });

    server.addEventListener('close', () => {
      this.onClose(server, ctx);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async onMessage(
    socket: WebSocket,
    ctx: ConnectionContext,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      socket.close(CLOSE_POLICY, 'mensaje invalido');
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // No hay cliente legitimo que mande JSON invalido.
      socket.close(CLOSE_POLICY, 'json invalido');
      return;
    }

    const envelope = reqEnvelopeSchema.safeParse(parsed);
    if (!envelope.success) {
      socket.close(CLOSE_POLICY, 'sobre invalido');
      return;
    }

    const { id, ev, d } = envelope.data;
    const ack = await this.gateway.dispatch(ctx, ev, d);

    const response: ResEnvelope = { t: 'res', id, d: ack };
    try {
      socket.send(JSON.stringify(response));
    } catch {
      // Se cerro mientras procesabamos: no hay a quien responderle.
    }
  }

  private onClose(socket: WebSocket, ctx: ConnectionContext): void {
    this.contexts.delete(socket);
    this.emitter.remove(ctx.connectionId);
    this.gateway.handleDisconnect(ctx, 'transport close');
  }

  /**
   * Vencimiento de turno o barrido de abandonos.
   *
   * No asume por que se desperto: mira el reloj y ejecuta lo que corresponda.
   * Eso lo hace mas robusto que el diseño de Node, donde el sweep global y el
   * TurnScheduler son dos mecanismos independientes que pueden desincronizarse.
   */
  override async alarm(): Promise<void> {
    const now = Date.now();
    if (!this.roomId) return;

    // Abandonos y salas vencidas.
    for (const effect of this.rooms.sweep(now)) {
      const room = this.rooms.find(effect.roomId);
      if (effect.kind === 'state:patch' && room) {
        this.gateway.broadcastState(room, effect.events);
        this.gateway.broadcastRoom(room);
      }
    }

    // Turno vencido.
    const room = this.rooms.find(this.roomId);
    if (room?.game && room.game.turnDeadline <= now) {
      this.gateway.handleTurnExpired(this.roomId);
    }

    // Reprogramar mientras queden deadlines por vencer.
    const next = this.rooms.find(this.roomId);
    if (next?.game && next.game.phase !== 'game_over') {
      await this.ctx.storage.setAlarm(next.game.turnDeadline);
    }
  }
}
