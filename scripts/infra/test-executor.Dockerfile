FROM node:24-bookworm-slim
RUN npm install -g pnpm@10.26.1
WORKDIR /workspace
