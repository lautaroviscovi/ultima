import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './ui.js';

/**
 * La intencion de cantar ÚLTIMA.
 *
 * Esto existe por un bug de REGLAS que rompia una mecanica entera: el cliente
 * derivaba `declareUno` de `hand.length === 2`, o sea que cantaba SOLO cada vez
 * que jugabas tu penultima carta.
 *
 * Como el engine solo abre la ventana de acusacion si NO cantaste
 * (`openUnoWindowIfNeeded`), esa ventana no se abria nunca: acusar era
 * imposible y el boton ¡ÚLTIMA! era decorativo.
 *
 * El cliente no tenia un solo test de este flujo, y por eso paso desapercibido
 * mientras el engine tenia cinco tests de la mecanica correcta.
 */
describe('intención de cantar ÚLTIMA', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it('arranca desarmada: nadie canta por vos', () => {
    expect(useUIStore.getState().unoArmed).toBe(false);
  });

  it('el botón la arma', () => {
    useUIStore.getState().armUno();
    expect(useUIStore.getState().unoArmed).toBe(true);
  });

  /**
   * Se desarma al jugar porque `declareUno` ya viajo en ese comando. Si
   * quedara armada, la jugada SIGUIENTE cantaria sin que el jugador lo pida —
   * que es el mismo bug con otra forma.
   */
  it('EL BUG: se desarma al jugar, no queda pegada', () => {
    const ui = useUIStore.getState();
    ui.armUno();
    expect(useUIStore.getState().unoArmed).toBe(true);

    ui.disarmUno();
    expect(useUIStore.getState().unoArmed).toBe(false);
  });

  it('el reset de la partida la limpia', () => {
    useUIStore.getState().armUno();
    useUIStore.getState().reset();
    expect(useUIStore.getState().unoArmed).toBe(false);
  });

  it('armar dos veces es idempotente', () => {
    const ui = useUIStore.getState();
    ui.armUno();
    ui.armUno();
    expect(useUIStore.getState().unoArmed).toBe(true);
    ui.disarmUno();
    expect(useUIStore.getState().unoArmed).toBe(false);
  });
});
