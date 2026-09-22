import type { ReactNode } from 'react';

export interface HudButtonProps {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  /**
   * Es un toggle y esta ACTIVO.
   *
   * `undefined` significa que no es un toggle sino una accion, y entonces no
   * lleva `aria-pressed` — un boton que no alterna no deberia anunciarse como
   * presionable.
   */
  pressed?: boolean;
  /** Accion destructiva: no puede verse igual que un toggle. */
  danger?: boolean;
}

/**
 * Un control del HUD de la mesa.
 *
 * Existe porque los cuatro botones del HUD compartian la clase EXACTA, con dos
 * consecuencias:
 *
 * 1. **"Salir" se veia igual que los toggles.** La unica accion destructiva de
 *    la pantalla, con el mismo peso visual que "cambiar el orden".
 * 2. **El estado de un toggle se comunicaba solo cambiando la palabra.**
 *    "sonido" vs "silencio" — habia que LEER para saber si estaba prendido.
 *    Ahora el fondo cambia, que se ve sin leer.
 */
export function HudButton({
  children,
  onClick,
  title,
  pressed,
  danger = false,
}: HudButtonProps): JSX.Element {
  const isToggle = pressed !== undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      {...(title ? { title } : {})}
      {...(isToggle ? { 'aria-pressed': pressed } : {})}
      className={`rounded-full px-3 py-1 text-mini transition-colors ${
        danger
          ? 'text-white/60 hover:bg-intent-danger/20 hover:text-intent-danger'
          : isToggle && pressed
            ? 'bg-raised-hover text-white'
            : 'text-white/60 hover:bg-raised hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
