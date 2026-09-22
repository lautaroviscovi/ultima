import { useEffect, useRef } from 'react';

/**
 * Lo minimo que un modal necesita para no ser una trampa con teclado.
 *
 * Hace tres cosas, y las tres son bugs si faltan:
 *
 * 1. **Mueve el foco adentro al abrir.** Sin esto el foco se queda donde
 *    estaba — detras del modal — y quien navega con teclado sigue tabulando
 *    por una mesa que ya no puede tocar.
 * 2. **Lo devuelve al cerrar**, al elemento que lo tenia antes. Si no, el foco
 *    salta al principio del documento y hay que re-navegar toda la pagina.
 * 3. **Atrapa el Tab adentro**, ciclando entre el primero y el ultimo
 *    enfocable. Un modal del que se puede salir tabulando no es modal.
 *
 * `Escape` se deja afuera a proposito: no todo modal se puede cerrar. El de
 * fin de ronda NO — es el estado del juego, no un popup — mientras que el
 * ColorPicker si. Cada uno pasa su propio `onEscape`.
 */
export function useModalFocus(
  open: boolean,
  onEscape?: (() => void) | undefined,
): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  /** Quien tenia el foco antes de abrir, para devolverselo. */
  const previous = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    if (!node) return;

    previous.current = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );

    // Al primer enfocable, o al contenedor si no hay ninguno.
    const first = focusables()[0];
    if (first) first.focus();
    else {
      node.tabIndex = -1;
      node.focus();
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;

      // El ciclo: del ultimo al primero y viceversa.
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Devolver el foco sólo si sigue en el documento: si el modal se cerró
      // porque la pantalla entera cambió, el nodo viejo ya no existe.
      const back = previous.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open, onEscape]);

  return ref;
}
