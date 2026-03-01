# AGNI/Dockerfile — production-hardened Node image [R10 P3.5]
# Multi-arch: amd64 + arm64 + armv7 (Raspberry Pi)
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine

# Non-root user for security
RUN addgroup -S agni && adduser -S agni -G agni

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY hub-tools/ ./hub-tools/
COPY server/ ./server/
COPY schemas/ ./schemas/
COPY scripts/ ./scripts/
COPY data/hub-config.json data/governance-policy.json data/approved-catalog.json data/utu-constants.json data/badge-definitions.json ./data/

RUN mkdir -p data/events data/yaml serve && chown -R agni:agni /usr/src/app

USER agni

EXPOSE 8082 8081 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8082/health || exit 1

CMD [ "node", "src/cli.js" ]
