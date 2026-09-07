FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./package.json
COPY tsconfig.json ./tsconfig.json
COPY src ./src

RUN npm install
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
