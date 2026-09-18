import { io as connect, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  CommandEnvelope,
  JoinResult,
  PlayerCommand,
  RedactedRoomState,
  ResumeResult,
  ServerToClientEvents,
} from '@uno/protocol';
import type { GameEvent, RedactedGameState } from '@uno/engine';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Cliente de prueba: un socket real contra un servidor real en un puerto
 * efimero. No mockeamos Socket.IO — mockearlo cuesta mas de lo que da y dejaria
 * de probar justamente lo fragil (handshake, acks, reconexion).
 */
export class TestClient {
  private socket: ClientSocket;
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

  constructor(private readonly url: string) {
    this.socket = this.makeSocket();
  }

  private makeSocket(): ClientSocket {
    const socket: ClientSocket = connect(this.url, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
    });

    socket.on('state:sync', (state) => {
      this.state = state;
      this.received.push(state);
    });
    socket.on('state:patch', (payload) => {
      this.state = payload.state;
      this.events.push(...payload.events);
      this.received.push(payload);
    });
    socket.on('room:updated', (room) => {
      this.room = room;
      this.received.push(room);
    });
    socket.on('error:game', (error) => {
      this.errors.push(error);
    });

    return socket;
  }

  get id(): string {
    return this.socket.id ?? '';
  }

  get connected(): boolean {
    return this.socket.connected;
  }

  async waitConnected(): Promise<void> {
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', reject);
    });
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

  /** Corta el socket de golpe, como una caida de red. */
  hardDisconnect(): void {
    this.socket.disconnect();
  }

  /** Vuelve con un socket nuevo, como haria el cliente real tras reconectar. */
  async reconnect(): Promise<void> {
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = this.makeSocket();
    await this.waitConnected();
  }

  close(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
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
  private emit<T>(event: keyof ClientToServerEvents, ...args: unknown[]): Promise<T> {
    return new Promise<T>((resolve) => {
      (this.socket.emit as (e: string, ...rest: unknown[]) => void)(event, ...args, resolve);
    });
  }
}
