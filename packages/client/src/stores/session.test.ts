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

  it('recorta y limita el nickname', () => {
    const store = useSessionStore.getState();
    store.setNickname('   Lautaro   ');
    expect(useSessionStore.getState().nickname).toBe('Lautaro');

    store.setNickname('x'.repeat(50));
    expect(useSessionStore.getState().nickname).toHaveLength(20);
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
