/**
 * Los timers de turno viven en el SERVIDOR, no en el cliente.
 *
 * El cliente solo renderiza un countdown derivado de `turnDeadline` (un
 * timestamp absoluto que va en el estado redactado). No se confia en el reloj
 * del cliente para nada mas que pintar pixeles.
 *
 * Aislado del RoomManager para poder testear con fake timers sin arrastrar
 * toda la logica de salas.
 *
 * Esta es la implementacion para Node. Un Durable Object necesita la Alarms
 * API en su lugar: un setTimeout muere cuando el objeto hiberna, y hibernar es
 * justo lo que pasa cuando un jugador NO juega — el caso que este timer existe
 * para resolver.
 */
import type { Scheduler } from './ports.js';

export class TurnScheduler implements Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly onExpire: (roomId: string) => void) {}

  /** Reprograma el turno de una sala. Cancela el anterior. */
  schedule(roomId: string, deadline: number, now: number): void {
    this.cancel(roomId);
    const delay = Math.max(0, deadline - now);
    const timer = setTimeout(() => {
      this.timers.delete(roomId);
      this.onExpire(roomId);
    }, delay);
    // No mantener vivo el proceso por un timer de turno.
    timer.unref?.();
    this.timers.set(roomId, timer);
  }

  cancel(roomId: string): void {
    const timer = this.timers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(roomId);
    }
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  get pending(): number {
    return this.timers.size;
  }
}
