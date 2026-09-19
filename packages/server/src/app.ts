import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { DEFAULT_OPTIONS, type GameOptions } from '@uno/engine';
import { CompositeEmitter, Gateway, RoomManager, silentLogger, type Logger } from '@uno/core';
import { TurnScheduler } from './TurnScheduler.js';
import { registerSocketIO, SocketIOEmitter, type UnoServer } from './socketio.js';
import { registerWsTransport, WsEmitter } from './wsTransport.js';

export interface AppConfig {
  clientOrigins: string[];
  reconnectGraceMs: number;
  roomTtlMs: number;
  sweepIntervalMs: number;
  options: GameOptions;
  logger: Logger;
  now: () => number;
}

export const DEFAULT_CONFIG: AppConfig = {
  clientOrigins: ['http://localhost:5173'],
  reconnectGraceMs: 120_000,
  roomTtlMs: 3_600_000,
  sweepIntervalMs: 10_000,
  options: DEFAULT_OPTIONS,
  logger: silentLogger,
  now: () => Date.now(),
};

export interface UnoApp {
  httpServer: HttpServer;
  io: UnoServer;
  rooms: RoomManager;
  scheduler: TurnScheduler;
  gateway: Gateway;
  listen(port: number): Promise<number>;
  close(): Promise<void>;
}

export function createApp(overrides: Partial<AppConfig> = {}): UnoApp {
  const config: AppConfig = { ...DEFAULT_CONFIG, ...overrides };

  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, uptime: process.uptime() });
  });
  /**
   * Las salas viven en memoria, asi que un redeploy mata las partidas en curso.
   * Este endpoint es la mitigacion barata: mirar antes de desplegar.
   */
  app.get('/health/rooms', (_req, res) => {
    res.json({
      count: rooms.size,
      rooms: rooms.list().map((room) => ({
        id: room.id,
        players: room.seats.length,
        connected: room.seats.filter((s) => s.connected).length,
        started: room.game !== null,
        phase: room.game?.phase ?? 'lobby',
      })),
    });
  });

  const httpServer = createServer(app);

  const io: UnoServer = new Server(httpServer, {
    cors: {
      // Lista exacta, NUNCA '*': con '*' cualquier pagina puede abrir sockets
      // contra el server. Si algo no conecta, se arregla la lista.
      origin: config.clientOrigins,
      credentials: true,
    },
  });

  const rooms = new RoomManager({
    reconnectGraceMs: config.reconnectGraceMs,
    roomTtlMs: config.roomTtlMs,
    options: config.options,
  });

  /**
   * Los dos transportes comparten el MISMO RoomManager y el MISMO Gateway.
   *
   * El composite rutea cada push al transporte dueño de la conexion, asi que
   * dos jugadores en la misma sala por transportes distintos se ven entre si.
   * Sin esto haria falta un Gateway por transporte, con salas separadas.
   */
  const socketIoEmitter = new SocketIOEmitter(io);
  const wsEmitter = new WsEmitter();
  const emitter = new CompositeEmitter();
  emitter.register(socketIoEmitter);
  emitter.register(wsEmitter);

  const scheduler = new TurnScheduler((roomId) => gateway.handleTurnExpired(roomId));
  const gateway = new Gateway({
    emitter,
    rooms,
    scheduler,
    logger: config.logger,
    now: config.now,
  });
  registerSocketIO(io, gateway, socketIoEmitter);
  registerWsTransport({ httpServer, gateway, emitter: wsEmitter, logger: config.logger });

  // Barrido de abandonos y salas vencidas.
  const sweepTimer = setInterval(() => {
    const effects = rooms.sweep(config.now());
    for (const effect of effects) {
      const room = rooms.find(effect.roomId);
      if (effect.kind === 'state:patch' && room) {
        gateway.broadcastState(room, effect.events);
        gateway.broadcastRoom(room);
      }
      if (effect.kind === 'room:closed') scheduler.cancel(effect.roomId);
    }
  }, config.sweepIntervalMs);
  sweepTimer.unref?.();

  return {
    httpServer,
    io,
    rooms,
    scheduler,
    gateway,
    listen(port: number): Promise<number> {
      return new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        // Puerto 0 = efimero, que es lo que usan los tests de integracion.
        httpServer.listen(port, () => {
          const address = httpServer.address();
          resolve(typeof address === 'object' && address ? address.port : port);
        });
      });
    },
    async close(): Promise<void> {
      clearInterval(sweepTimer);
      scheduler.cancelAll();
      await io.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
