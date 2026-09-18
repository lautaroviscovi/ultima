# Deploy

Dos piezas, dos servicios:

| Pieza              | Dónde  | Por qué                                                   |
| ------------------ | ------ | --------------------------------------------------------- |
| Cliente (estático) | Vercel | Es un build de Vite, nada más                             |
| Servidor (sockets) | Fly.io | Necesita un proceso **persistente** con estado en memoria |

**Vercel no sirve para el servidor.** Sus funciones son efímeras: no hay proceso
que sobreviva entre requests, no hay estado en memoria, y las conexiones
WebSocket de larga duración no son su modelo.

---

## Antes de empezar

```bash
brew install flyctl
npm i -g vercel
```

Necesitás cuenta en [fly.io](https://fly.io) y [vercel.com](https://vercel.com).
Las dos tienen free tier suficiente para esto.

Hay un problema del huevo y la gallina: el servidor necesita saber el dominio
del cliente (`CLIENT_ORIGIN`) y el cliente necesita saber el del servidor
(`VITE_SERVER_URL`). Por eso el orden de abajo primero despliega el servidor,
después el cliente, y al final vuelve a ajustar el servidor.

---

## 1. Servidor en Fly.io

```bash
cd ~/Desktop/uno
fly auth login
```

Crear la app sin desplegar todavía (el `fly.toml` ya está en el repo):

```bash
fly launch --no-deploy --copy-config --name uno-server
```

Si el nombre `uno-server` está tomado, elegí otro y **acordate de cambiarlo
también en `fly.toml`**, porque de ahí sale la URL `https://<nombre>.fly.dev`.

Un placeholder para el primer deploy (lo corregimos en el paso 3):

```bash
fly secrets set CLIENT_ORIGIN=https://localhost
```

```bash
fly deploy
```

Verificá que quedó vivo:

```bash
curl https://uno-server.fly.dev/health
```

Tiene que responder `{"ok":true,"rooms":0,...}`.

---

## 2. Cliente en Vercel

Desde la raíz del repo (el `vercel.json` ya tiene el build command y el rewrite):

```bash
vercel login
```

```bash
vercel link
```

La variable con la URL del servidor del paso 1:

```bash
vercel env add VITE_SERVER_URL production
```

Cuando pregunte el valor, poné `https://uno-server.fly.dev` (o el nombre que
hayas usado).

```bash
vercel --prod
```

Anotá el dominio que te devuelve, por ejemplo `https://uno-abc123.vercel.app`.

---

## 3. Cerrar el círculo del CORS

Ahora sí, el servidor tiene que aceptar el dominio real del cliente:

```bash
fly secrets set CLIENT_ORIGIN=https://uno-abc123.vercel.app
```

Eso reinicia la máquina sola. **Este paso no es opcional**: sin él, el navegador
falla con un error de CORS que se ve como "no conecta" y cuesta encontrar.

Si querés que anden también los preview deployments de Vercel, van separados por
coma:

```bash
fly secrets set CLIENT_ORIGIN=https://uno-abc123.vercel.app,https://uno-git-main-tu-usuario.vercel.app
```

---

## 4. Probar de verdad

Abrí el dominio de Vercel, creá una sala y dictá el código. El gate del MVP es
**una partida de 10 personas reales, desde internet, de principio a fin**.

---

## Lo que hay que saber para operar esto

### Un redeploy mata las partidas en curso

Las salas viven **en memoria**. Es un trade-off asumido: sin cuentas, sin
ranking y sin historial no hay nada que persistir, y una base de datos sólo
agregaría superficie de bugs.

La mitigación es barata — mirar antes de desplegar:

```bash
curl https://uno-server.fly.dev/health/rooms
```

Si hay salas con `"phase"` distinto de `game_over`, hay gente jugando. El
servidor avisa con un mensaje antes de cortar (`SIGTERM` → aviso → 3s → cierre),
pero la partida se pierde igual.

### Una sola instancia, a propósito

No escales el servidor horizontalmente sin leer esto primero. El estado de las
salas es **local al proceso**: con dos instancias, un jugador que aterriza en la
B no encuentra la sala que vive en la A.

Arreglarlo requiere dos cosas **juntas**: sticky sessions en el balanceador (el
handshake de Socket.IO son varias requests que deben ir al mismo nodo) y
`@socket.io/redis-adapter` para que los broadcasts crucen instancias. Y aun así
el adapter propaga _mensajes_, no _estado_, así que haría falta afinidad de sala
por `roomId`.

Una instancia de Node maneja cientos de partidas concurrentes: el trabajo por
comando son microsegundos y el cuello es la red. **No escales antes de tener el
problema.**

### No apagues la máquina

En `fly.toml`, `auto_stop_machines = false` y `min_machines_running = 1` son
críticos: si la máquina se duerme se mueren todas las partidas en curso y el
primer jugador se come el cold start.

Por la misma razón el free tier de **Render no sirve** para esto: duerme tras
inactividad.

### Logs

```bash
fly logs
```

Cada línea lleva `roomId` y, al iniciar una partida, el `seed`. Eso es lo que
convierte un "se colgó la partida" en un test de regresión: una partida es
función de `(seed, comandos)`.

---

## Variables de entorno

Están todas documentadas en [`.env.example`](.env.example). Las que importan:

| Variable          | Dónde  | Nota                                                             |
| ----------------- | ------ | ---------------------------------------------------------------- |
| `CLIENT_ORIGIN`   | Fly    | **Obligatoria** en producción. Lista exacta, nunca `*`           |
| `VITE_SERVER_URL` | Vercel | Se **inlinea en el bundle**: es pública, nunca pongas un secreto |
| `TURN_TIMEOUT_MS` | Fly    | 45s por defecto; con 10 jugadores no conviene bajarlo            |

El servidor **valida la config al arrancar** y falla con un mensaje claro si
algo está mal. Es deliberado: fallar al arrancar es mucho mejor que fallar en la
primera conexión.

---

## Problemas frecuentes

**"No conecta" desde el navegador.** Casi siempre es `CLIENT_ORIGIN`. Mirá
`fly logs` y la consola del navegador. Verificá que el dominio esté _exacto_,
con `https://` y sin barra final.

**`/room/XK4T` da 404 al recargar.** Falta el rewrite SPA. Ya está en
`vercel.json`; si lo tocaste, revisá que siga.

**Conecta pero se reconecta cada 20s.** El upgrade a WebSocket está fallando en
algún proxy. Como último recurso se puede forzar `transports: ['websocket']` en
el cliente, aceptando que se pierde el fallback a long-polling.
