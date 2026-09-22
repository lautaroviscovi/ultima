import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFitsTable } from './useFitsTable.js';
import { MIN_WIDTH } from '../components/TableLayout.js';

/**
 * El modo de falla de este hook es SILENCIOSO: si deja de reaccionar, el aviso
 * de ancho minimo no aparece y nadie se entera hasta que alguien organiza una
 * partida desde el telefono y no puede jugarla.
 */

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(matches: boolean) {
  const listeners: Listener[] = [];
  const mql = {
    matches,
    media: `(min-width: ${MIN_WIDTH}px)`,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  const spy = vi.fn(() => mql);
  vi.stubGlobal('matchMedia', spy);
  return {
    spy,
    listenerCount: () => listeners.length,
    emit: (next: boolean) => {
      mql.matches = next;
      for (const fn of [...listeners]) fn({ matches: next } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useFitsTable', () => {
  it('en una ventana ancha dice que entra', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useFitsTable());
    expect(result.current).toBe(true);
  });

  it('en una ventana angosta dice que NO entra', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useFitsTable());
    expect(result.current).toBe(false);
  });

  it('reacciona al cruzar el umbral sin recargar', () => {
    const media = mockMatchMedia(false);
    const { result } = renderHook(() => useFitsTable());
    expect(result.current).toBe(false);

    // El usuario agranda la ventana.
    act(() => media.emit(true));
    expect(result.current).toBe(true);

    // Y la vuelve a achicar.
    act(() => media.emit(false));
    expect(result.current).toBe(false);
  });

  it('consulta el umbral REAL, no un numero suelto', () => {
    // Si alguien cambia MIN_WIDTH, la query tiene que seguirlo. Un literal
    // duplicado aca haria que el aviso y la mesa discrepen.
    const media = mockMatchMedia(true);
    renderHook(() => useFitsTable());
    expect(media.spy).toHaveBeenCalledWith(`(min-width: ${MIN_WIDTH}px)`);
  });

  it('no explota si matchMedia no existe', () => {
    // Mismo criterio que `useReducedMotion`: el hook no puede tumbar el Home
    // en un entorno sin matchMedia. Ante la duda, asume que entra.
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useFitsTable());
    expect(result.current).toBe(true);
  });

  it('desuscribe al desmontar, para no filtrar listeners', () => {
    const media = mockMatchMedia(true);
    const { unmount } = renderHook(() => useFitsTable());
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });
});
