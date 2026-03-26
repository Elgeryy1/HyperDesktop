FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY next.config.mjs ./
COPY postcss.config.mjs ./
COPY tailwind.config.ts ./
COPY tsconfig.json ./
COPY next-env.d.ts ./
COPY src ./src

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start"]

