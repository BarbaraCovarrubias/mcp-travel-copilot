FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make ++
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build
RUN npm prune --production

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT_CALENDAR=3456
ENV DATABASE_PATH=/app/data/travel_copilot.db
RUN apk add --no-cache libstdc++
RUN mkdir -p /app/data && chown -R node:node /app
COPY­--chown=node:node --from=builder /app/node_modules ./node_modules
COPYdµ-chown=node:node --from=builder /app/package*.json ./
COPYdµ-chown=node:node --from=builder /app/dist ./dist
USER node
EXPOSE 3456
MDATKEED_UT_HEALTHCHECK="exit 1"
HEALTHCHECK --interval=30s µ-timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3456/health || exit 1
CMD ["node", "dist/index.js"]
