# ÚLTIMA — 2 a 10 jugadores

Un juego de cartas web para jugar con el equipo. El diferencial es el único que
importa: **una mesa legible y jugable con hasta 10 personas**, porque las
plataformas existentes topan en 4.

Se llama **ÚLTIMA** por lo que se grita al quedar con una carta. El nombre del
producto **es** el grito, que es la misma relación que tiene "UNO" con el juego
original — y ese nombre es marca registrada de Mattel, así que con el juego
público no se usa.

**Jugar: https://uno-delta-two.vercel.app** — hace falta una ventana de al
menos 1100×600px; la mesa de 10 no entra en un teléfono.

## Principios

1. **Una sola fuente de verdad: el proceso del servidor.** El cliente es una
   función de render sobre una vista _redactada_ de ese estado. Si el cliente
   "sabe" algo que el servidor no le dio, está mal.
2. **El engine es una función pura.** `reduce(state, command, ctx) -> { state, events }`.
   Sin I/O, sin `Math.random()`, sin `Date.now()` — hay una regla de ESLint que
   lo hace mecánico. Toda la partida es función de `(seed, comandos)`.

## Estado

| Fase | Qué                           | Estado               |
| ---- | ----------------------------- | -------------------- |
| 0    | Andamiaje del monorepo        | ✅                   |
| 1    | Engine puro testeado, sin UI  | ✅                   |
| 2    | Server + protocolo, sin UI    | ✅                   |
| 3    | Cliente: esqueleto y conexión | ✅                   |
| 4    | Componentes en Storybook      | ✅                   |
| 5    | Mesa de juego conectada       | ✅                   |
| 6    | Animaciones y pulido          | ✅                   |
| 7    | Deploy y endurecimiento       | ✅ **en producción** |
| 8    | Sistema de diseño y rediseño  | ✅ **en producción** |

## Paquetes

```
packages/
├── engine/     @uno/engine    reglas puras, cero deps de red
├── protocol/   @uno/protocol  eventos socket + schemas zod
├── core/       @uno/core      salas y gateway, agnósticos del runtime
├── server/     @uno/server    Node + Socket.IO (desarrollo)
├── worker/     @uno/worker    Cloudflare Durable Objects (producción)
└── client/     @uno/client    React + Vite + Zustand + Storybook
```

Grafo estrictamente acíclico: `engine ← protocol ← core ← {server, worker}`, y
`client → engine, protocol`.

`core` existe por el port a Cloudflare: la lógica de salas, turnos y broadcast
no depende del runtime, así que vive aparte y la usan los dos transportes. El
servidor Node quedó para desarrollo y para el cliente de terminal; producción
corre en el Worker.

`protocol` va separado de `engine` porque el engine no debe saber que existe una
red; si los tipos de Socket.IO vivieran adentro, dejaría de ser portable a un
modo hot-seat o a bots locales.

El scope npm sigue siendo `@uno/*` a propósito: renombrarlo tocaría cada import
del repo para no cambiar nada que se vea. El nombre del producto está en la UI,
que es donde importa.

## Comandos

```bash
pnpm install
pnpm test         # suite completa (269 tests)
pnpm lint
pnpm typecheck

# Cobertura. OJO: `pnpm test --coverage` NO funciona — pnpm intercepta el flag
# y responde "Unknown option: 'coverage'".
npx vitest run --coverage

# Los tests del worker corren aparte, DENTRO de workerd real (34 tests).
pnpm --filter @uno/worker test

pnpm sim          # gate de fase 1: 1000 partidas de 10 jugadores con bots
pnpm sim 200 4    # 200 partidas de 4 jugadores

# servidor y cliente (uno en cada terminal)
pnpm --filter @uno/server dev            # :3000
pnpm --filter @uno/client dev            # :5173
pnpm --filter @uno/client storybook      # :6006

# cliente de terminal, para jugar sin UI.
# OJO: el servidor tiene que estar corriendo en OTRA terminal.
pnpm --filter @uno/server cli -- --bots 9    # crea sala con 9 bots
pnpm --filter @uno/server cli -- --room XK4T # se une a una sala
pnpm --filter @uno/server cli -- --url http://localhost:4000
```

## Protocolo

Socket.IO con genericos nativos: si se agrega un campo a `RedactedGameState`,
el cliente no compila hasta manejarlo. Cada payload entrante pasa por un schema
zod antes de tocar el engine.

Decisiones que sostienen el protocolo:

- **Estado completo en cada patch, no diffs.** Con 10 jugadores son pocos KB. Un
  diff real seria optimizacion prematura y una fuente de desincronizacion.
- **Solo comandos de jugador viajan por el cable.** `TIMEOUT`, `ABANDON`,
  `DISCONNECT` y `NEXT_ROUND` los origina el servidor; aceptarlos del cliente
  seria un vector de griefing trivial.
- **El `playerId` sale del socket autenticado, nunca del payload**, o seria
  suplantacion de identidad.
- **Un error ilegal se responde SOLO al emisor.** Contarselo a los otros 9
  revelaria que ese jugador tiene esa carta.
- **`clientSeq` hace idempotentes los reintentos** y `expectedVersion` rechaza
  comandos emitidos desde un estado viejo (`STALE_COMMAND` + resync).
- **El `playerToken` va solo en el ack**, jamas en un broadcast: es la
  credencial del asiento, y no hay login.

## Reglas implementadas

Mazo oficial de 108 cartas, reparto de 7, skip / reverse / draw2 / wild / wild4,
reshuffle del descarte, carta inicial volteada con todos sus casos, ÚLTIMA
(cantar al quedar con una carta) con ventana de acusación no bloqueante,
puntaje oficial y objetivo configurable.

Decisiones de producto que se apartan del reglamento de Mattel:

- **Wild Draw Four permisivo.** Jugable siempre, sin validar que no tengas el
  color activo y sin sistema de desafío, porque así juega el equipo.
  Consecuencia asumida: el +4 no tiene costo. El comando `CHALLENGE_WILD4` está
  reservado en el tipo para cuando se agregue el toggle en fase 2.
- **Con stacking de +2/+4, y libre**: un +2 se tapa con +4 y viceversa, sin
  importar el color. Se acumula en `pendingDraw` y el objetivo tiene dos
  salidas: taparlo o comerse la cadena entera. La regla oficial es SIN
  stacking; se eligió jugarlo así.

## Casos borde cubiertos

Los que rompen las implementaciones de este juego, cada uno con test dedicado:

- **Reverse con 2 jugadores** actúa como skip. Ojo: **no** sale solo de la
  aritmética — con `n = 2`, avanzar una posición lleva al otro jugador sea cual
  sea el signo de la dirección. Se saltea explícitamente en `applyCardEffect`.
- **Wild4 como carta inicial**: vuelve al mazo y se re-baraja, en un loop que
  consume del RNG.
- **Reverse inicial** cambia _quién empieza_, no solo la dirección.
- **Ganar con un +2**: el siguiente igual roba, y esas cartas cuentan para su
  puntaje. El orden es `efecto → ÚLTIMA → fin de ronda → avanzar turno`. Es la
  única excepción al stacking: con la ronda cerrada no hay turno donde
  responder, así que el castigo se cobra ahí mismo.
- **Timeout con un castigo encima**: se roba el acumulado, no una carta. Si no,
  dejar vencer el reloj sería la forma barata de esquivar un +8.
- **Abandonar con un castigo encima**: el pendiente se limpia. El siguiente no
  tuvo nada que ver con ese duelo.
- **Ganar con un wild**: no se le pide el color a quien ya ganó.
- **Reshuffle** con descarte de ≤1 carta: no roba y pasa, sin lanzar. Los wilds
  vuelven sin color asignado, o el reshuffle filtraría información.
- **Timeouts**: auto-robar (nunca auto-jugar), y a los 3 seguidos el jugador
  pasa a `idle` y se lo saltea.
- **Desconexión ≠ abandono**: el timer no se pausa, porque pausarlo deja que una
  conexión mala congele a los otros 9.

## El layout de 10 jugadores

El diferencial del producto vive en `TableLayout` y su geometria
(`components/seats.ts`), y se valida en Storybook sin cablear nada: la story
`TableLayout` tiene un control de 2 a 10 jugadores y una vista con los nueve
layouts juntos.

Las dos decisiones que lo hacen posible:

- **Tu mano NO es un asiento.** Es UI separada, fija abajo y a tamaño completo.
  Eso libera el borde inferior, que es el espacio mas valioso.
- **El asiento tiene tamaño FIJO.** Lo que varia es la separacion angular sobre
  un arco de 280 grados, no el tamaño. Escalar todo hacia abajo es exactamente
  lo que hacen mal las plataformas que topan en 4-8 jugadores.

El turno se señala con cuatro señales simultaneas a distinta escala de
atencion: anillo de progreso (turno + urgencia en un elemento), atenuacion de
los demas, elevacion del activo, y cambio del marco entero cuando te toca.
Con gente en videollamada la atencion esta partida y no se puede asumir que
esten mirando la mesa.

## La mesa conectada

Los componentes de la fase 4 cableados al store. Tres decisiones que se ven en
el codigo:

- **Un comando no toca el estado de juego.** En el camino feliz solo se marca
  la carta como "volando" (optimismo visual); el `state:patch` que llega
  despues es la verdad. Si el servidor rechaza, la carta vuelve a la mano.
- **El color de un wild viaja EN el comando de la jugada**, no como una fase
  aparte: un round-trip menos. El `CHOOSE_COLOR` suelto queda para cuando el
  color lo pide el servidor, que pasa si la carta inicial volteada es un wild.
- **El countdown se deriva de `turnDeadline`**, un timestamp absoluto del
  servidor. El timer autoritativo vive alla; el cliente solo pinta pixeles.

## En producción

- **Jugar:** https://uno-delta-two.vercel.app
- **Servidor:** https://uno-server.viscovilautaro.workers.dev

Front en Vercel, servidor en **Cloudflare Workers + Durable Objects**. Una sala
es un Durable Object: un objeto con estado en memoria e identidad estable por
codigo de sala, que es exactamente la forma del `RoomManager`.

Se eligio sobre Fly.io porque el plan free de Cloudflare cubre este caso sin
tarjeta: 100.000 requests/dia y 13.000 GB-s, que son ~22 partidas completas de
10 jugadores por dia. Fly hoy factura por uso (~4 USD/mes con la maquina
siempre prendida).

Los pasos para redesplegar estan en **[DEPLOY.md](DEPLOY.md)**.

El servidor **valida la config al arrancar** y falla con un mensaje claro si
algo esta mal — fallar al arrancar es mucho mejor que fallar en la primera
conexion con un error de CORS que desde el navegador se ve como "no conecta".

## Animaciones y sonido

La carta que sale de tu mano y aparece en el descarte es **la misma** para
Framer Motion: `layoutId={card.id}` hace la transicion compartida y la carta
vuela. Esa es la razon concreta por la que las cartas tienen id unico por
INSTANCIA y no por cara — sin eso, al jugar una de tus dos `red-7` React no
sabria cual desaparecio y la animacion saltaria.

El reverse tiene la animacion mas grande del juego a proposito: es la jugada
que mas confunde en este juego online, y con 10 jugadores un cambio de sentido
que pasa desapercibido hace que la gente juegue fuera de turno.

**Robar también se anima**, y no es adorno: es la segunda acción más frecuente
y durante mucho tiempo no producía ningún movimiento — la carta simplemente
aparecía en la mano. El nodo que vuela usa un `layoutId` PROPIO y no el de la
carta: cuando empieza el vuelo la carta ya está en tu mano, y dos nodos
montados con el mismo `layoutId` hacen que Framer los trate como el mismo
elemento, con la carta saltando desde la esquina.

Los sonidos se sintetizan con WebAudio, sin archivos. El tick de turno es lo
mas efectivo del set para atencion partida: con gente en videollamada nadie
mira la mesa todo el tiempo.

**La voz la pone el navegador** (Web Speech API), así que tampoco hay
grabaciones. Dice cuatro frases, todas sobre algo que te pasó a vos:
`¡Última!`, `Te saltearon`, `Robás cuatro`, `Se acabó tu tiempo`. Narrar cada
jugada sería insoportable a los cinco minutos.

Esa API es frágil —`getVoices()` puede devolver vacío hasta que dispara un
evento que a veces no llega, y que exista voz en español depende del sistema
operativo— así que se resuelve con timeout y **siempre hay fallback al tono
sintetizado**. Quedarse mudo sería peor que no tener voz. Tiene toggle propio,
separado del de sonido: en una videollamada la voz compite con la gente
hablando.

## El sistema de diseño

Los valores viven en `packages/client/src/design/tokens.css` como custom
properties; `tailwind.config.js` sólo les da nombre de utilidad. Cambiar un
color es tocar una línea de CSS, sin rebuild de config.

**La regla que más se viola sin querer: pigmento ≠ intención.**

| Capa          | Tokens                      | Dónde se puede usar                                     |
| ------------- | --------------------------- | ------------------------------------------------------- |
| **Pigmento**  | `uno-red/yellow/green/blue` | La cara de la carta, el swatch del ColorPicker, el halo |
| **Intención** | `intent-ok/warn/danger/...` | Errores, urgencia, conexión, foco                       |
| **Marca**     | `brand-accent`, `brand-ink` | El wordmark, el botón ¡ÚLTIMA!, el marco de "te toca"   |

No son lo mismo aunque se parezcan: los pigmentos están elegidos para leerse
sobre el **blanco del óvalo** de la carta, y los `intent-*` sobre el **fieltro
verde**. Usar el verde de carta para un punto de "conectado" fue un bug real —
quedaba verde sobre verde, justo en el estado que uno confirma de un vistazo.

Si un `uno-*` aparece fuera de `Card`, `ColorPicker`, `DiscardPile` o `card/`,
está mal. **Las dos excepciones están comentadas en el código**: `ReverseFlash`
y `DirectionIndicator` usan `uno-yellow` porque son el eco visual de la carta
que se acaba de jugar, no un estado de interfaz.

Lo mismo con los tamaños de texto: la escala es semántica (`text-micro`,
`text-mini`, `text-body`, `text-lead`, `text-figure-*`, `text-display-*`). Los
`figure-*` son categoría aparte porque **no son texto, son cifras**: van con
`line-height: 1` y `tabular-nums`, así un "10" y un "11" ocupan lo mismo y el
abanico no tiembla.

### Todo es SVG y CSS, cero assets

Las cartas se dibujan con SVG inline: el óvalo, los glifos de skip/reverse/+2,
el disco del comodín y el dorso. Antes Skip y Reverse eran **caracteres
Unicode**, lo que significa que el símbolo más importante de la carta lo elegía
la fuente del sistema — distinto en cada OS, y a veces un rectángulo vacío.

Todo lo demás sigue el mismo criterio: el confeti son 12 divs con física manual
(no una librería), los sonidos se sintetizan con WebAudio (no hay archivos de
audio), la voz la pone el navegador (no hay grabaciones) y la superficie de la
mesa es un gradiente CSS.

Las dos fuentes (Outfit para cifras, Inter para UI) son lo único que se
descarga, self-hosted y sólo en subsets latinos — el paquete trae nueve, de los
que el juego usa dos.

### Una sola variable por carta

```
--card-w: 40px | 60px | 90px

height        = calc(var(--card-w) * 1.6)     ← ratio 5:8 en los TRES tamaños
border-radius = calc(var(--card-w) * 0.09)
figure size   = calc(var(--card-w) * 0.52)
```

Antes cada tamaño tenía su propio ratio, y por eso el dorso del asiento se veía
"más gordo" que la carta de tu mano: no eran la misma carta a otra escala, eran
cartas distintas.

### La identidad de cada jugador sale del asiento

El color del avatar se deriva del `seat`, no de un hash del nickname. Con 10
asientos y 10 colores, derivar del asiento **garantiza** que dos jugadores
nunca compartan color; un hash no lo garantiza, y falla justo en la mesa llena,
que es donde el color hace falta. Además es estable: cambiarse el nombre a
mitad de partida no te cambia el color.

## Accesibilidad

- **`prefers-reduced-motion`** se respeta en los dos frentes: `MotionConfig`
  cubre Framer Motion y una media query global en `tokens.css` cubre las
  animaciones y transiciones CSS. Storybook tiene un toggle para verlo.
- **Los modales** (`RoundOverlay`, `ColorPicker`) llevan `role="dialog"`,
  `aria-modal`, foco que entra al abrir y vuelve al cerrar, y Tab atrapado en
  un ciclo. `Escape` cierra el ColorPicker pero **no** el de fin de ronda: ese
  no es un popup, es el estado del juego.
- **El foco visible** usa un celeste (`intent-focus`) y no el azul de carta: un
  anillo azul-carta desaparece justo encima de una carta azul.
- **La voz** es opcional y tiene toggle propio, separado del de sonido.

## Sesion e identidad

El `playerToken` es la credencial del asiento: no hay login. Se guarda en
**`sessionStorage`, que es por pestaña**, no en `localStorage`.

La diferencia importa y ya causo un bug: con `localStorage`, dos pestañas del
mismo navegador comparten la entrada y la segunda pisa el token de la primera.
Al recargar, la primera reclamaba el asiento de la segunda **y veia su mano**.
El servidor respondia correctamente — le mandaban el token de otro asiento —,
el error era del cliente. Es raro entre personas distintas, pero es exactamente
como se prueba una mesa de 10 en una sola computadora.

El costo asumido: cerrar la pestaña pierde la sesion. Es el trade-off correcto,
porque perder el asiento al cerrar es recuperable y robarle el asiento a otro
no lo es. El nickname si va a `localStorage`: es una preferencia de persona.

## La frontera de seguridad

`redact(state, viewerId)` es la única función autorizada a producir lo que sale
por el cable. Cada jugador ve su mano completa y solo el **conteo** de las
ajenas; del mazo solo va el tamaño, nunca el orden.

No es un detalle de implementación: cualquiera abre DevTools → Network → WS y ve
cada frame que recibió. Ocultar las manos ajenas en el render de React deja el
juego trivialmente explotable. Hay un test que simula partidas completas de 10
jugadores y falla si un `CardId` ajeno aparece en cualquier payload.

## Verificación

```
269 tests (115 engine + 60 integracion + 81 cliente + 13 core) + 34 del worker
96% de cobertura del engine
1000 partidas de 10 jugadores simuladas, 0 violaciones de invariantes
partida completa de 10 jugadores por sockets reales, 0 filtraciones
```

Los del worker corren aparte y dentro de `workerd` real, no de un mock: probar
un Durable Object con el runtime de Node no probaria nada de lo que importa.

Invariantes chequeadas en cada paso: siempre 108 cartas, ningún `CardId`
duplicado, el jugador de turno siempre existe y nunca está abandonado, y ninguna
partida se cuelga.

Los bots **se olvidan de cantar ÚLTIMA** 1 de cada 3 veces, y acusan cuando
pueden. No es realismo: es cobertura. Mientras todos cantaban siempre, el motor
nunca abría la ventana de acusación (`openUnoWindowIfNeeded` sólo la abre si
NO cantaste), así que esa mecánica —con sus partes delicadas: idempotencia ante
acusaciones simultáneas y una ventana que debe cerrarse sola— pasaba 1000
partidas en verde sin ejecutarse una sola vez. El gate ahora **reporta** cuántas
acusaciones penalizaron: si vuelve a dar 0, es que dejó de ejercitarse.

## Licencia

MIT — ver [LICENSE](LICENSE).

Proyecto personal, sin relación con Mattel. Las reglas de los juegos de cartas
no son registrables; la marca "UNO" sí, y por eso no se usa.
