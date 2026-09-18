# UNO — 2 a 10 jugadores

Un UNO web para jugar con el equipo. El diferencial es el único que importa:
**una mesa legible y jugable con hasta 10 personas**, porque las plataformas
existentes topan en 4.

## Principios

1. **Una sola fuente de verdad: el proceso del servidor.** El cliente es una
   función de render sobre una vista _redactada_ de ese estado. Si el cliente
   "sabe" algo que el servidor no le dio, está mal.
2. **El engine es una función pura.** `reduce(state, command, ctx) -> { state, events }`.
   Sin I/O, sin `Math.random()`, sin `Date.now()` — hay una regla de ESLint que
   lo hace mecánico. Toda la partida es función de `(seed, comandos)`.

## Estado

| Fase | Qué                           | Estado |
| ---- | ----------------------------- | ------ |
| 0    | Andamiaje del monorepo        | ✅     |
| 1    | Engine puro testeado, sin UI  | ✅     |
| 2    | Server + protocolo, sin UI    | ⬜     |
| 3    | Cliente: esqueleto y conexión | ⬜     |
| 4    | Componentes en Storybook      | ⬜     |
| 5    | Mesa de juego conectada       | ⬜     |
| 6    | Animaciones y pulido          | ⬜     |
| 7    | Deploy y endurecimiento       | ⬜     |

## Paquetes

```
packages/
├── engine/     @uno/engine    reglas puras, cero deps de red
├── protocol/   @uno/protocol  eventos socket + schemas zod   (fase 2)
├── server/     @uno/server    Socket.IO, salas, timers        (fase 2)
└── client/     @uno/client    React + Vite + Storybook        (fase 3)
```

Grafo estrictamente acíclico: `engine ← protocol ← server`, y `client → engine, protocol`.

`protocol` va separado de `engine` porque el engine no debe saber que existe una
red; si los tipos de Socket.IO vivieran adentro, dejaría de ser portable a un
modo hot-seat o a bots locales.

## Comandos

```bash
pnpm install
pnpm test         # suite completa
pnpm test --coverage
pnpm sim          # gate de fase 1: 1000 partidas de 10 jugadores con bots
pnpm sim -- 200 4 # 200 partidas de 4 jugadores
pnpm lint
pnpm typecheck
```

## Reglas implementadas

Mazo oficial de 108 cartas, reparto de 7, skip / reverse / draw2 / wild / wild4,
reshuffle del descarte, carta inicial volteada con todos sus casos, UNO con
ventana de acusación no bloqueante, puntaje oficial y objetivo configurable.

Decisiones de producto que se apartan del reglamento de Mattel:

- **Wild Draw Four permisivo.** Jugable siempre, sin validar que no tengas el
  color activo y sin sistema de desafío, porque así juega el equipo.
  Consecuencia asumida: el +4 no tiene costo. El comando `CHALLENGE_WILD4` está
  reservado en el tipo para cuando se agregue el toggle en fase 2.
- **Sin stacking de +2/+4** (esto sí es la regla oficial). El campo
  `pendingDraw` ya existe en el estado para habilitarlo sin refactor.

## Casos borde cubiertos

Los que rompen implementaciones de UNO, cada uno con test dedicado:

- **Reverse con 2 jugadores** actúa como skip. Ojo: **no** sale solo de la
  aritmética — con `n = 2`, avanzar una posición lleva al otro jugador sea cual
  sea el signo de la dirección. Se saltea explícitamente en `applyCardEffect`.
- **Wild4 como carta inicial**: vuelve al mazo y se re-baraja, en un loop que
  consume del RNG.
- **Reverse inicial** cambia _quién empieza_, no solo la dirección.
- **Ganar con un +2**: el siguiente igual roba, y esas cartas cuentan para su
  puntaje. El orden es `efecto → UNO → fin de ronda → avanzar turno`.
- **Ganar con un wild**: no se le pide el color a quien ya ganó.
- **Reshuffle** con descarte de ≤1 carta: no roba y pasa, sin lanzar. Los wilds
  vuelven sin color asignado, o el reshuffle filtraría información.
- **Timeouts**: auto-robar (nunca auto-jugar), y a los 3 seguidos el jugador
  pasa a `idle` y se lo saltea.
- **Desconexión ≠ abandono**: el timer no se pausa, porque pausarlo deja que una
  conexión mala congele a los otros 9.

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
110 tests · 96% de cobertura del engine
1000 partidas de 10 jugadores simuladas, 0 violaciones de invariantes
```

Invariantes chequeadas en cada paso: siempre 108 cartas, ningún `CardId`
duplicado, el jugador de turno siempre existe y nunca está abandonado, y ninguna
partida se cuelga.
