FROM node:22-bookworm-slim

# Required by the Contabo release operator; never bake SSH keys into the image.
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client ca-certificates \
  && rm -rf /var/lib/apt/lists/*

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
