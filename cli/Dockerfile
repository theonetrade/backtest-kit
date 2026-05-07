FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY scripts/install.mjs .
COPY package.json .

RUN node ./install.mjs

ENTRYPOINT ["node", "/usr/local/lib/node_modules/@backtest-kit/cli/build/index.mjs"]
