# Build multi-stage: la imagen final solo lleva el bundle y sus deps de runtime.
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

# Primero los manifests: si no cambian, Docker reusa la capa de instalacion.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# --ignore-scripts evita compilar binarios del cliente que no usamos aca.
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY packages/engine ./packages/engine
COPY packages/protocol ./packages/protocol
COPY packages/server ./packages/server

RUN pnpm --filter @uno/server build

# --- Runtime ---
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json ./packages/server/

# Solo dependencias de produccion. El engine y el protocol ya estan DENTRO del
# bundle, asi que no hace falta copiarlos: pnpm ignora los `workspace:*` que
# no encuentra y instala nada mas socket.io, express, pino, nanoid y zod.
# Verificado corriendo el bundle con solo estas deps, fuera del monorepo.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

COPY --from=builder /app/packages/server/dist ./packages/server/dist

# No corremos como root.
USER node

EXPOSE 3000

# Healthcheck contra el endpoint real, no un ping al puerto.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
