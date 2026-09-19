import type { Emitter, PushPayload } from './ports.js';
import type { ServerToClientEvents } from '@uno/protocol';

/**
 * Rutea cada push al transporte dueño de esa conexion.
 *
 * Durante el port, Socket.IO y WebSocket nativo conviven sobre el MISMO
 * servidor y el MISMO RoomManager. Sin esto haria falta un Gateway por
 * transporte, cada uno con sus propias salas — y dos jugadores en la misma
 * sala por transportes distintos no se verian.
 *
 * Cada `Emitter` registrado declara que conexiones conoce; el composite le
 * manda a quien corresponda. Un push a una conexion desconocida se descarta en
 * silencio, igual que `io.to()` con un socket que ya se fue.
 */
export interface OwnedEmitter extends Emitter {
  /** Si esta conexion le pertenece a este transporte. */
  owns(connectionId: string): boolean;
}

export class CompositeEmitter implements Emitter {
  private readonly emitters: OwnedEmitter[] = [];

  register(emitter: OwnedEmitter): void {
    this.emitters.push(emitter);
  }

  push<E extends keyof ServerToClientEvents>(
    connectionId: string,
    event: E,
    data: PushPayload<E>,
  ): void {
    for (const emitter of this.emitters) {
      if (emitter.owns(connectionId)) {
        emitter.push(connectionId, event, data);
        return;
      }
    }
  }
}
