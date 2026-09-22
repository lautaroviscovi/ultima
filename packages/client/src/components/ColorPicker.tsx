import { AnimatePresence, motion } from 'framer-motion';
import { COLORS, type Color } from '@uno/engine';
import { DURATION, SPRING } from '../design/motion.js';
import { useModalFocus } from '../hooks/useModalFocus.js';

export interface ColorPickerProps {
  open: boolean;
  onPick: (color: Color) => void;
  onCancel?: () => void;
  /**
   * Esta jugada te deja en una carta: hay que poder cantar ÚLTIMA desde acá.
   *
   * Sin esto, jugar un comodin como penultima carta era una trampa: tocar la
   * carta abre este modal —`inset-0` y con el foco atrapado— asi que el boton
   * ¡ÚLTIMA! de la barra de mano queda INALCANZABLE. Si no habias cantado
   * antes de elegir la carta, perdias la chance y te acusaban.
   */
  aboutToWin?: boolean;
  /** Ya cantaste: la jugada va a viajar con `declareUno`. */
  unoArmed?: boolean;
  onDeclareUno?: () => void;
}

const SWATCH: Record<Color, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
};

const LABEL: Record<Color, string> = {
  red: 'Rojo',
  yellow: 'Amarillo',
  green: 'Verde',
  blue: 'Azul',
};

export function ColorPicker({
  open,
  onPick,
  onCancel,
  aboutToWin = false,
  unoArmed = false,
  onDeclareUno,
}: ColorPickerProps): JSX.Element {
  /**
   * Acá SÍ va `onEscape`: cancelar es válido — elegiste un wild y te
   * arrepentiste. El de fin de ronda no lo pasa, porque ahí cerrar dejaría al
   * jugador mirando una mesa muerta.
   *
   * El hook va antes de cualquier return: el `if (!open) return null` que
   * había arriba haría que la cantidad de hooks cambie entre renders.
   */
  const ref = useModalFocus(open, onCancel);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-label="Elegí el color"
          aria-modal="true"
          className="absolute inset-0 z-30 flex items-center justify-center bg-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.quick }}
        >
          <motion.div
            ref={ref}
            className="rounded-2xl bg-overlay p-6 shadow-modal"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            transition={SPRING.settle}
          >
            <p className="mb-4 text-center font-bold text-white">Elegí el color</p>
            <div className="grid grid-cols-2 gap-3">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onPick(color)}
                  aria-label={LABEL[color]}
                  className={`${SWATCH[color]} h-20 w-20 rounded-xl border-4 border-white/20
                          transition-transform hover:scale-110`}
                />
              ))}
            </div>
            {/*
              El canto va ACA, sobre el cancelar, porque esta jugada te deja
              en una carta y este modal es lo unico que ves.

              Es un INTERRUPTOR, no una accion: lo que hace es decidir si el
              comando que estas por mandar lleva `declareUno`. Por eso queda
              marcado y no desaparece al tocarlo — tenes que poder ver que
              cantaste antes de elegir el color.
            */}
            {aboutToWin && onDeclareUno && (
              <button
                type="button"
                onClick={onDeclareUno}
                aria-pressed={unoArmed}
                className={`mt-4 w-full rounded-lg py-2 font-display text-body font-black
                            transition-colors ${
                              unoArmed
                                ? 'bg-intent-ok text-brand-ink'
                                : 'bg-brand-accent text-brand-ink hover:brightness-110'
                            }`}
              >
                {unoArmed ? '¡ÚLTIMA! ✓' : '¡ÚLTIMA!'}
              </button>
            )}

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-2 w-full rounded-lg py-2 text-body text-white/60 hover:text-white"
              >
                Cancelar
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
