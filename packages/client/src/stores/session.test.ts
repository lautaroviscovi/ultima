import { beforeEach, describe, expect, it } from 'vitest';
import { useSessionStore } from './session.js';

/**
 * El bug que estos tests previenen: con localStorage, dos pestañas del mismo
 * navegador comparten la entrada de sesion y la segunda pisa el token de la
 * primera. Al recargar, la primera reclamaba el asiento de la segunda y veia
 * SU MANO. El servidor respondia bien; el error era del cliente.
 *
 * Es raro entre personas distintas (cada uno en su maquina), pero es
 * exactamente como se prueba una mesa de 10 en una sola compu.
 */
describe('useSessionStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    useSessionStore.setState({ nickname: '', sessions: {} });
  });

  it('guarda el asiento por sala', () => {
    const store = useSessionStore.getState();
    store.remember('AB12', 'token-a', 'player-a');

    expect(useSessionStore.getState().sessionFor('AB12')).toEqual({
      playerToken: 'token-a',
      playerId: 'player-a',
    });
  });

  it('mantiene sesiones de salas distintas a la vez', () => {
    const store = useSessionStore.getState();
    store.remember('AB12', 'token-a', 'player-a');
    store.remember('CD34', 'token-b', 'player-b');

    const state = useSessionStore.getState();
    expect(state.sessionFor('AB12')?.playerToken).toBe('token-a');
    expect(state.sessionFor('CD34')?.playerToken).toBe('token-b');
  });

  it('persiste los asientos en sessionStorage, NO en localStorage', () => {
    // sessionStorage es por pestaña: es lo que impide que una pestaña le robe
    // el asiento a la otra. Si esto vuelve a localStorage, vuelve el bug.
    useSessionStore.getState().remember('AB12', 'token-a', 'player-a');

    const persisted = sessionStorage.getItem('uno:session');
    expect(persisted, 'el asiento debe vivir en sessionStorage').toContain('token-a');
    expect(localStorage.getItem('uno:session'), 'nunca en localStorage').toBeNull();
  });

  it('el nickname SI se comparte entre pestañas', () => {
    // Es una preferencia de persona, no de asiento: sobrevive al cierre.
    useSessionStore.getState().setNickname('Lautaro');
    expect(localStorage.getItem('uno:nickname')).toBe('Lautaro');
    expect(sessionStorage.getItem('uno:session') ?? '').not.toContain('Lautaro');
  });

  /**
   * EL BUG QUE SE VIO JUGANDO: no se podia escribir "Juan Pérez".
   *
   * El store hacia `trim()` al guardar, y `Home.tsx` lo llama en CADA tecla
   * sobre un input controlado. Al apretar la barra espaciadora despues de
   * "Juan", el valor pasaba a "Juan ", el trim lo volvia a "Juan", y la
   * segunda palabra nunca podia empezar.
   *
   * El test viejo pasaba igual porque probaba espacios en los EXTREMOS
   * (`'   Lautaro   '`), nunca en el medio — o sea, daba falsa confianza
   * sobre justo el caso que fallaba.
   */
  it('EL BUG: deja escribir un nombre con espacios', () => {
    const store = useSessionStore.getState();

    // Tecla por tecla, como escribe una persona.
    for (const value of ['J', 'Ju', 'Jua', 'Juan', 'Juan ', 'Juan P']) {
      store.setNickname(value);
      expect(useSessionStore.getState().nickname).toBe(value);
    }

    store.setNickname('Juan Pérez');
    expect(useSessionStore.getState().nickname).toBe('Juan Pérez');
  });

  it('acota el largo, pero no toca el contenido', () => {
    const store = useSessionStore.getState();

    store.setNickname('x'.repeat(50));
    expect(useSessionStore.getState().nickname).toHaveLength(20);

    // El recorte de extremos es responsabilidad de quien ENVIA, no del store:
    // recortar mientras se tipea es lo que rompia los espacios.
    store.setNickname('  Lautaro  ');
    expect(useSessionStore.getState().nickname).toBe('  Lautaro  ');
  });

  it('olvida una sala sin tocar las demas', () => {
    const store = useSessionStore.getState();
    store.remember('AB12', 'token-a', 'player-a');
    store.remember('CD34', 'token-b', 'player-b');

    useSessionStore.getState().forget('AB12');

    const state = useSessionStore.getState();
    expect(state.sessionFor('AB12')).toBeUndefined();
    expect(state.sessionFor('CD34')?.playerToken).toBe('token-b');
  });
});
