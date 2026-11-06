FROM apify/actor-node:22

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --include=dev

COPY . ./

RUN npm run build && npm prune --omit=dev --no-package-lock

CMD ["node", "dist/main.js"]

