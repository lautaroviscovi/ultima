import { AnimatePresence, motion } from 'framer-motion';
import { COLORS, type Color } from '@uno/engine';
import { DURATION, SPRING } from '../design/motion.js';
import { useModalFocus } from '../hooks/useModalFocus.js';

export interface ColorPickerProps {
  open: boolean;
  onPick: (color: Color) => void;
  onCancel?: () => void;
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

export function ColorPicker({ open, onPick, onCancel }: ColorPickerProps): JSX.Element {
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
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="mt-4 w-full rounded-lg py-2 text-body text-white/60 hover:text-white"
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
