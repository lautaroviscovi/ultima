import type {
  Ack,
  ClientToServerEvents,
  CommandEnvelope,
  JoinResult,
  PlayerCommand,
  RedactedRoomState,
  ResumeResult,
} from '@uno/protocol';
import type { GameEvent, RedactedGameState } from '@uno/engine';
import { createTransport, type TestTransport, type TransportKind } from './transport.js';

/**
 * Cliente de prueba: un socket real contra un servidor real en un puerto
 * efimero. No mockeamos Socket.IO — mockearlo cuesta mas de lo que da y dejaria
 * de probar justamente lo fragil (handshake, acks, reconexion).
 */
export class TestClient {
  private transport: TestTransport;
  private seq = 0;

  playerId: string | null = null;
  playerToken: string | null = null;
  roomId: string | null = null;

  state: RedactedGameState | null = null;
  room: RedactedRoomState | null = null;
  readonly events: GameEvent[] = [];
  readonly errors: Array<{ code: string; message: string }> = [];
  /** Todo lo recibido, para auditar filtraciones. */
  readonly received: unknown[] = [];

  constructor(
    private readonly url: string,
    private readonly kind: TransportKind = 'socketio',
  ) {
    this.transport = createTransport(kind, url);
  }

  /** Los pushes del servidor, sin importar el transporte. */
  private handlePush = (event: string, data: unknown): void => {
    switch (event) {
      case 'state:sync':
        this.state = data as RedactedGameState;
        this.received.push(data);
        break;
      case 'state:patch': {
        const patch = data as { state: RedactedGameState; events: GameEvent[] };
        this.state = patch.state;
        this.events.push(...patch.events);
        this.received.push(data);
        break;
      }
      case 'room:updated':
        this.room = data as RedactedRoomState;
        this.received.push(data);
        break;
      case 'error:game':
        this.errors.push(data as { code: string; message: string });
        break;
      default:
        break;
    }
  };

  get connected(): boolean {
    return this.transport.connected;
  }

  async waitConnected(): Promise<void> {
    if (this.transport.connected) return;
    await this.transport.connect({ onPush: this.handlePush });
  }

  async createRoom(nickname: string, options?: object): Promise<Ack<JoinResult>> {
    const res = await this.emit<Ack<JoinResult>>('room:create', { nickname, options });
    if (res.ok) this.remember(res);
    return res;
  }

  async joinRoom(roomId: string, nickname: string): Promise<Ack<JoinResult>> {
    const res = await this.emit<Ack<JoinResult>>('room:join', { roomId, nickname });
    if (res.ok) this.remember(res);
    return res;
  }

  async resume(roomId: string, playerToken: string): Promise<Ack<ResumeResult>> {
    const res = await this.emit<Ack<ResumeResult>>('session:resume', { roomId, playerToken });
    if (res.ok) {
      this.playerId = res.playerId;
      this.roomId = roomId;
      this.playerToken = playerToken;
      if (res.state) this.state = res.state;
    }
    return res;
  }

  start(options?: object): Promise<Ack> {
    return this.emit<Ack>('game:start', { options });
  }

  nextRound(): Promise<Ack> {
    return this.emit<Ack>('game:nextRound');
  }

  leave(): Promise<Ack> {
    return this.emit<Ack>('room:leave');
  }

  /** Manda un comando. `raw` permite payloads invalidos a proposito. */
  command(
    command: PlayerCommand,
    opts: { expectedVersion?: number; clientSeq?: number } = {},
  ): Promise<Ack<{ version: number; clientSeq: number }>> {
    const envelope: CommandEnvelope = {
      command,
      clientSeq: opts.clientSeq ?? ++this.seq,
      ...(opts.expectedVersion !== undefined ? { expectedVersion: opts.expectedVersion } : {}),
    };
    return this.emit<Ack<{ version: number; clientSeq: number }>>('game:command', envelope);
  }

  /** Para probar validacion: manda cualquier cosa por el canal de comandos. */
  rawCommand(payload: unknown): Promise<Ack<{ version: number; clientSeq: number }>> {
    return this.emit<Ack<{ version: number; clientSeq: number }>>('game:command', payload);
  }

  /** Corta la conexion de golpe, como una caida de red. */
  hardDisconnect(): void {
    this.transport.hardDisconnect();
  }

  /** Vuelve con una conexion nueva, como haria el cliente real. */
  async reconnect(): Promise<void> {
    this.transport.close();
    this.transport = createTransport(this.kind, this.url);
    await this.transport.connect({ onPush: this.handlePush });
  }

  close(): void {
    this.transport.close();
  }

  /** Espera a que se cumpla una condicion, con timeout claro. */
  async waitFor(predicate: () => boolean, timeoutMs = 2000, label = 'condicion'): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error(`timeout esperando ${label}`);
  }

  private remember(res: Extract<Ack<JoinResult>, { ok: true }>): void {
    this.playerId = res.playerId;
    this.playerToken = res.playerToken;
    this.roomId = res.roomId;
    this.room = res.room;
  }

  /**
   * Emite y espera el ack. El tipo de retorno lo fijan los helpers publicos de
   * arriba, que son los que conocen la forma de cada ack.
   */
  private emit<T>(event: keyof ClientToServerEvents, payload?: unknown): Promise<T> {
    return this.transport.request<T>(event, payload);
  }
}
