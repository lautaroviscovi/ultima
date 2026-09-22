import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorToast } from './ErrorToast.js';
import type { GameError } from '../stores/game.js';

/**
 * El toast se quedaba FIJO en pantalla, para siempre.
 *
 * El temporizador estaba bien. Lo que fallaba era la lista de dependencias:
 * el efecto dependia de `onDismiss`, y `Table.tsx` lo pasa como arrow inline,
 * o sea una funcion nueva en cada render. Cada render cancelaba el timer y lo
 * reiniciaba, y en una partida hay renders constantes (el reloj del turno,
 * cada patch del servidor), asi que nunca llegaba a los 3 segundos.
 *
 * Es el MISMO modo de falla del reverse flash: derivar comportamiento de algo
 * que cambia de identidad en cada render. Por eso el test central no es "se
 * cierra a los 3s" sino "se cierra aunque el padre re-renderice".
 */
const ERROR: GameError = { code: 'WRONG_PHASE', message: 'x', at: 0 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('ErrorToast', () => {
  it('se cierra solo a los 3 segundos', () => {
    const onDismiss = vi.fn();
    render(<ErrorToast error={ERROR} onDismiss={onDismiss} />);

    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /**
   * El test que importa. Con la lista de dependencias vieja, este re-render
   * cada 500ms reiniciaba la cuenta y `onDismiss` no se llamaba jamas.
   */
  it('EL BUG: se cierra aunque el padre re-renderice con un callback nuevo', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ErrorToast error={ERROR} onDismiss={() => onDismiss()} />);

    // Seis renders en 3 segundos, cada uno con una funcion DISTINTA, que es
    // exactamente lo que hace `onDismiss={() => setError(null)}` en Table.
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(500);
      rerender(<ErrorToast error={ERROR} onDismiss={() => onDismiss()} />);
    }

    expect(onDismiss, 'el toast quedó fijo en pantalla').toHaveBeenCalledTimes(1);
  });

  /** Un error NUEVO sí reinicia la cuenta: es otro mensaje, merece sus 3s. */
  it('un error nuevo reinicia la cuenta', () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<ErrorToast error={ERROR} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(2000);
    rerender(<ErrorToast error={{ ...ERROR, at: 1 }} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(2000);
    expect(onDismiss, 'se cerró antes de mostrar el segundo error').not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('sin error no muestra nada', () => {
    const { container } = render(<ErrorToast error={null} onDismiss={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
