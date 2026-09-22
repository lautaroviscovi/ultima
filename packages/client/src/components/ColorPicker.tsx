import { COLORS, type Color } from '@uno/engine';

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

export function ColorPicker({ open, onPick, onCancel }: ColorPickerProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Elegí el color"
      className="absolute inset-0 z-30 flex items-center justify-center bg-scrim"
    >
      <div className="rounded-2xl bg-overlay p-6 shadow-modal">
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
      </div>
    </div>
  );
}
