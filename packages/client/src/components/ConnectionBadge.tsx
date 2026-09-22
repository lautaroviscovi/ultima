import type { ConnectionStatus } from '../stores/game.js';

/**
 * El punto usa colores de INTENCION, no pigmentos de carta.
 *
 * `bg-uno-green` era un bug real: el verde de la carta esta elegido para
 * leerse sobre el blanco del ovalo, y este punto vive sobre el fieltro, que
 * tambien es verde. El resultado era verde sobre verde — justo en el estado
 * "todo bien", que es el que uno confirma de un vistazo. `intent-ok` es mas
 * claro precisamente para despegarse del fondo.
 */
const LABEL: Record<ConnectionStatus, { text: string; dot: string }> = {
  // `bg-white/30` y no un token: es un dot APAGADO, no una superficie. La
  // escala de superficies es por elevacion y aca no hay elevacion que expresar.
  idle: { text: 'sin conectar', dot: 'bg-white/30' },
  connecting: { text: 'conectando', dot: 'bg-intent-warn animate-pulse' },
  connected: { text: 'en línea', dot: 'bg-intent-ok' },
  reconnecting: { text: 'reconectando', dot: 'bg-intent-warn animate-pulse' },
  disconnected: { text: 'sin conexión', dot: 'bg-intent-danger' },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }): JSX.Element {
  const { text, dot } = LABEL[status];
  return (
    <span className="flex items-center gap-2 rounded-full bg-raised px-3 py-1 text-mini">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}
