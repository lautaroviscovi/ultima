/** Mira si una sala vieja todavia tiene estado en produccion. */
import WebSocket from 'ws';
const HOST = 'uno-server.viscovilautaro.workers.dev';

async function check(room: string) {
  const ws = new WebSocket(`wss://${HOST}/ws?room=${room}`);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  const reply = new Promise<any>((res) => {
    ws.on('message', (raw) => {
      const e = JSON.parse(String(raw));
      if (e.t === 'res') res(e.d);
    });
  });
  // Intentar crear: si la sala ya existe con jugadores, falla distinto.
  ws.send(JSON.stringify({ t: 'req', id: 1, ev: 'room:create', d: { nickname: 'sonda' } }));
  const r = await Promise.race([
    reply,
    new Promise((res) => setTimeout(() => res({ timeout: true }), 4000)),
  ]);
  ws.close();
  return r;
}

for (const room of process.argv.slice(2)) {
  const r: any = await check(room);
  console.log(`${room}: ${r.ok ? 'creo sala nueva (estaba vacia)' : `${r.code} — ${r.message}`}`);
}
process.exit(0);
