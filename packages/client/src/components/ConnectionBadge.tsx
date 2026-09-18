import type { ConnectionStatus } from '../stores/game.js';

const LABEL: Record<ConnectionStatus, { text: string; dot: string }> = {
  idle: { text: 'sin conectar', dot: 'bg-white/30' },
  connecting: { text: 'conectando', dot: 'bg-uno-yellow animate-pulse' },
  connected: { text: 'en línea', dot: 'bg-uno-green' },
  reconnecting: { text: 'reconectando', dot: 'bg-uno-yellow animate-pulse' },
  disconnected: { text: 'sin conexión', dot: 'bg-uno-red' },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }): JSX.Element {
  const { text, dot } = LABEL[status];
  return (
    <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}
