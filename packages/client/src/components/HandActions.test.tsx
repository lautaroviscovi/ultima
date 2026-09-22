import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HandActions } from './HandActions.js';

/**
 * Cuando aparece cada boton.
 *
 * Los dos botones nuevos existen porque faltaban salidas: robar exigia
 * clickear el mazo —que esta en el centro de la mesa, lejos de tu mano— y
 * PASAR directamente no se podia. `pass()` existia en `commands.ts` desde
 * siempre y ningun componente lo llamaba: solo se alcanzaba desde el CLI.
 *
 * Lo que se testea acá es la VISIBILIDAD, no el estilo, porque de eso depende
 * que el jugador sepa que puede hacer. Un boton que aparece cuando no
 * corresponde ofrece algo que el motor va a rechazar.
 */
describe('HandActions', () => {
  it('sin jugables muestra Robar', () => {
    render(<HandActions mustDraw onDraw={vi.fn()} />);
    expect(screen.getByText('Robar')).toBeTruthy();
  });

  it('sin mustDraw no muestra Robar', () => {
    render(<HandActions onDraw={vi.fn()} />);
    expect(screen.queryByText('Robar')).toBeNull();
  });

  /**
   * `HandActions` no dibuja un boton que no tendria a donde llamar. Es la
   * misma regla que `Card` con `onPlay`, y ya hizo que dos stories se vieran
   * SIN el boton que venian a mostrar.
   */
  it('sin handler no dibuja el botón, aunque corresponda', () => {
    render(<HandActions mustDraw canPass />);
    expect(screen.queryByText('Robar')).toBeNull();
    expect(screen.queryByText('Paso')).toBeNull();
  });

  it('tras robar una jugable muestra Paso', () => {
    render(<HandActions canPass onPass={vi.fn()} />);
    expect(screen.getByText('Paso')).toBeTruthy();
  });

  it('fuera de card_drawn no muestra Paso', () => {
    render(<HandActions onPass={vi.fn()} />);
    expect(screen.queryByText('Paso')).toBeNull();
  });

  /**
   * Robar lleva a `card_drawn`, que es donde aparece Paso: son estados
   * sucesivos, nunca simultaneos. Si los dos se vieran juntos, uno de los dos
   * estaria ofreciendo algo que el motor rechaza.
   */
  it('Robar y Paso nunca conviven', () => {
    const { container } = render(
      <HandActions mustDraw canPass onDraw={vi.fn()} onPass={vi.fn()} />,
    );
    const textos = [...container.querySelectorAll('button')].map((b) => b.textContent);
    const ambos = textos.includes('Robar') && textos.includes('Paso');
    expect(ambos, 'se ven los dos a la vez').toBe(false);
  });

  it('¡ÚLTIMA! está deshabilitado hasta que quedás en dos cartas', () => {
    const { rerender } = render(<HandActions onDeclareUno={vi.fn()} />);
    expect(screen.getByText('¡ÚLTIMA!').closest('button')?.disabled).toBe(true);

    rerender(<HandActions aboutToWin onDeclareUno={vi.fn()} />);
    expect(screen.getByText('¡ÚLTIMA!').closest('button')?.disabled).toBe(false);
  });

  /** Cantado tiene que VERSE: de eso depende saber si te pueden acusar. */
  it('cantado se distingue de no cantado', () => {
    render(<HandActions aboutToWin armed onDeclareUno={vi.fn()} />);
    expect(screen.getByText('¡ÚLTIMA! ✓')).toBeTruthy();
  });
});
