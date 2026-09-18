import { useEffect, useRef } from 'react';
import type { LogEntry } from '../hooks/useEventLog.js';

const TONE: Record<LogEntry['tone'], string> = {
  normal: 'text-white/70',
  alert: 'text-uno-yellow',
  good: 'text-uno-green',
};

/**
 * Narracion compacta, no chat. Con 9 oponentes las cosas pasan rapido y te
 * perdes que acaba de ocurrir.
 */
export function EventLog({ entries }: { entries: LogEntry[] }): JSX.Element | null {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Registro de la partida"
      className="pointer-events-none absolute bottom-2 right-3 max-h-24 w-64 overflow-hidden
                 rounded-lg bg-black/40 px-3 py-1.5 text-[0.7rem] leading-snug backdrop-blur-sm"
    >
      {entries.slice(-4).map((entry) => (
        <p key={entry.id} className={`truncate ${TONE[entry.tone]}`}>
          {entry.text}
        </p>
      ))}
      <div ref={endRef} />
    </div>
  );
}
