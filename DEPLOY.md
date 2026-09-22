# Deploy

| Pieza              | Dónde              | URL                                           |
| ------------------ | ------------------ | --------------------------------------------- |
| Cliente (estático) | Vercel             | https://uno-delta-two.vercel.app              |
| Servidor (sockets) | Cloudflare Workers | https://uno-server.viscovilautaro.workers.dev |

Una sala es un **Durable Object**: un objeto con estado en memoria e identidad
estable por código de sala. Es exactamente la forma del `RoomManager`, que por
eso corre adentro sin cambios.

---

## Redesplegar el servidor

```bash
cd packages/worker && npx wrangler deploy
```

Los tests corren dentro de `workerd` real, no de un mock:

```bash
pnpm --filter @uno/worker test
```

## Redesplegar el cliente

```bash
vercel --prod --yes --scope lautaro-viscovis-projects
```

El `--scope` no es opcional aunque `vercel whoami` responda bien: sin él el
deploy falla con un `"Not authorized"` que parece sesión vencida y no lo es. El
`orgId` que guarda `.vercel/project.json` no siempre resuelve solo.

El `vercel.json` ya tiene el build command, el `outputDirectory` y **el rewrite
SPA** — sin ese rewrite, `/room/XK4T` da 404 al recargar, que es el error de
deploy más común con Vite + React Router.

### Un cambio sólo-cliente NO corta las partidas

Vale la pena comprobarlo antes de desplegar, porque cambia el riesgo por
completo: si el backend no cambió, el Worker no se toca y nadie pierde su
partida.

```bash
git diff --stat <ref-anterior> HEAD -- packages/engine packages/protocol packages/core packages/server packages/worker
```

Vacío significa que alcanza con desplegar Vercel. Todo el rediseño visual
(fases 1-7) entró así.

**Ojo con el filtro**: los tests viven dentro de esos mismos paquetes, así que
el `--stat` puede salir con archivos aunque no cambie una línea de producción.
En el deploy de las fases 17-19 aparecían tres archivos y sólo uno
—`packages/core/src/gateway.ts`— era código real; los otros dos eran
`*.test.ts`. Si todos los archivos listados son tests, el Worker no cambia.

### Cuando SÍ se toca el servidor

No hay forma de listar las salas activas: cada una es un Durable Object con
identidad propia y `/health/room?code=XXXX` responde de a una. O sea que
**verificar que la mesa esté vacía es una pregunta para el equipo**, no algo
que se pueda comprobar con un comando.

### Que responda 200 NO prueba que se haya desplegado

Un deploy fallido deja el bundle anterior sirviendo con 200. La verificación
real es buscar en el bundle de producción una cadena que sólo exista en el
código nuevo:

```bash
curl -s "https://uno-delta-two.vercel.app" | grep -oE 'assets/[^"]+\.js' | head -1
```

Y después bajar ese archivo y buscar adentro. Conviene hacerlo **a un archivo
en disco y con Python**, no con `grep` sobre una variable de shell: con acentos
(`ÚLTIMA`, `CAMBIO DE SENTIDO`) zsh corta con `character not in range` y trunca
la descarga, lo que parece un deploy roto sin serlo.

---

## Variables de entorno

| Variable          | Dónde            | Nota                                                             |
| ----------------- | ---------------- | ---------------------------------------------------------------- |
| `CLIENT_ORIGIN`   | `wrangler.jsonc` | Lista **exacta** de orígenes, separados por coma. Nunca `*`      |
| `VITE_SERVER_URL` | Vercel           | Se **inlinea en el bundle**: es pública, nunca pongas un secreto |
| `TURN_TIMEOUT_MS` | `wrangler.jsonc` | 45s por defecto                                                  |

Al cambiar el dominio del cliente hay que actualizar `CLIENT_ORIGIN` en
`packages/worker/wrangler.jsonc` y redesplegar el Worker. **No es opcional**:
sin eso el navegador falla con CORS y el síntoma es "no conecta".

Un origen que no está en la lista **no recibe header de CORS**. Hacer fallback
al primer origen permitido sería incorrecto: el navegador lo bloquea igual,
pero le estaría diciendo a quien sondea cuál es el dominio autorizado.

---

## Lo que hay que saber para operar esto

### El plan free alcanza, con margen

- **100.000 requests/día.** Cada mensaje WebSocket cuenta. Una partida de 10
  jugadores son ~4.400 mensajes, o sea **~22 partidas completas por día**.
- **13.000 GB-s/día** ≈ 28 horas de sala activa.

Se puede mirar el consumo en el dashboard de Cloudflare, en Workers & Pages.

### El estado vive en memoria, con red de contención

Mientras el Durable Object está vivo, el estado en memoria es la fuente de
verdad. Si Cloudflare lo evicta, se rehidrata desde un snapshot en storage.

El snapshot **incluye la posición del RNG**, y eso no es un detalle: el RNG
vive fuera del `GameState`, así que sin esa posición el stream volvería a cero
al restaurar y el próximo re-barajado divergiría de la partida original — en
silencio.

Un snapshot de otra `schemaVersion` **se descarta** en vez de leerse mal.
Perder una sala es recuperable; reanudarla con manos desincronizadas entre
jugadores sería un bug irreportable.

### Un redeploy corta las partidas en curso

Los clientes reconectan solos con backoff y reclaman su asiento con el token,
así que en general la partida sigue. Pero si el deploy cambia la forma del
snapshot, las salas activas se cierran.

Para mirar antes de desplegar:

```bash
curl https://uno-server.viscovilautaro.workers.dev/health
```

### Mirar o limpiar una sala

No hay listado global a propósito: con Durable Objects cada sala es un objeto
independiente, sin registro central. Eso hace que el aislamiento entre salas
sea una garantía de plataforma y no una convención — pero significa que para
mirar una sala hay que nombrarla.

```bash
curl "https://uno-server.viscovilautaro.workers.dev/health/room?code=XK4T"
```

Una sala vencida por TTL se limpia sola. Para forzarlo después de probar:

```bash
curl -X POST "https://uno-server.viscovilautaro.workers.dev/admin/release?code=XK4T"
```

Se niega con un 409 si hay una **partida en curso** (una terminada sí se
libera). Esto también devuelve el código al pool: el flag `claimed` se persiste
para que dos `/claim` no colisionen, así que sin liberarlo cada partida
consumiría un código del espacio de ~920k para siempre.

**Cerrar la pestaña no alcanza para liberar una sala.** Un jugador
desconectado sigue contando: su asiento queda reservado para que pueda volver
con el token, que es lo que hace que la reconexión funcione. Así que una sala
recién abandonada devuelve 409 igual, y hay que esperar el TTL. No es un
problema en la práctica — los códigos nuevos salen de otro lado del espacio —
pero explica por qué un `release` inmediato después de probar "no funciona".

### Logs

```bash
cd packages/worker && npx wrangler tail
```

Cada línea lleva `roomId` y, al iniciar una partida, el `seed`. Eso es lo que
convierte un "se colgó la partida" en un test de regresión: una partida es
función de `(seed, comandos)`.

---

## Problemas frecuentes

**"No conecta" desde el navegador.** Casi siempre es `CLIENT_ORIGIN`. Verificá
que el dominio esté _exacto_, con `https://` y sin barra final, y que el Worker
se haya redesplegado después de cambiarlo.

**`/room/XK4T` da 404 al recargar.** Falta el rewrite SPA en `vercel.json`.

**`vercel --prod` responde `"Not authorized"`.** No es la sesión: `vercel
whoami` sigue respondiendo con tu usuario. Falta el scope, que el `orgId` de
`.vercel/project.json` no siempre resuelve solo.

```bash
vercel --prod --yes --scope lautaro-viscovis-projects
```

**Un dominio recién creado no resuelve.** El caché DNS local puede tener un
`NXDOMAIN` viejo. Se arregla solo en unos minutos, o con
`sudo dscacheutil -flushcache`. Para verificar mientras tanto:

```bash
curl --resolve uno-server.viscovilautaro.workers.dev:443:172.67.214.138 https://uno-server.viscovilautaro.workers.dev/health
```

**`wrangler deploy` pide un subdominio workers.dev.** Hay que abrir Workers &
Pages en el dashboard de Cloudflare una vez: eso lo crea automáticamente.
