FROM node:22-bookworm-slim

WORKDIR /app

COPY artifacts/cloudflare-mcp/package.json ./package.json
COPY artifacts/cloudflare-mcp/tsconfig.json ./tsconfig.json
COPY artifacts/cloudflare-mcp/src ./src

RUN npm install
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
