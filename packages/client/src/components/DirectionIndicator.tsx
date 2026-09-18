export interface DirectionIndicatorProps {
  direction: 1 | -1;
  /** Se acaba de invertir: el reverse merece la animacion mas grande del juego. */
  flash?: boolean;
}

/**
 * El reverse es la jugada que mas confunde en UNO online. Tiene presencia
 * ambiental constante (el arco girando) para que la direccion no haya que
 * deducirla del orden de los turnos.
 */
export function DirectionIndicator({
  direction,
  flash = false,
}: DirectionIndicatorProps): JSX.Element {
  return (
    <div
      aria-label={direction === 1 ? 'Sentido horario' : 'Sentido antihorario'}
      className={`pointer-events-none select-none text-3xl transition-all duration-500
                  ${flash ? 'scale-150 text-uno-yellow' : 'text-white/35'}`}
      style={{ transform: `scaleX(${direction})` }}
    >
      &#10227;
    </div>
  );
}
