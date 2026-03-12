FROM node:22-alpine

WORKDIR /app

COPY package.json server.mjs index.html README.md ./
COPY src ./src
COPY public ./public

EXPOSE 4173

CMD ["node", "server.mjs"]
