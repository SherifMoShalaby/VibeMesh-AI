# Stage 1: build frontend + install all deps
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: lean runtime — only what the server needs
FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist          ./dist
COPY --from=build /app/server        ./server
COPY --from=build /app/node_modules  ./node_modules
COPY --from=build /app/package.json  ./

# .env is NOT baked in — it is bind-mounted at runtime and may be written
# to by the server (applyRuntimeSetting saves API keys there).
# Create an empty .env on the host before `docker compose up`.

ENV NODE_ENV=production
# Override default 127.0.0.1 bind so the port is reachable outside the container
ENV HOST=0.0.0.0
EXPOSE 5175

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:5175/api/health || exit 1

CMD ["node", "server/index.mjs"]
