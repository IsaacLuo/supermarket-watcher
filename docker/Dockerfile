FROM node:16

WORKDIR /app
VOLUME [ "/app/logs", "/app/datasource" ]
ADD package.json .
ADD yarn.lock .
RUN yarn install
ADD tsconfig.json .
ADD conf .
ADD src .
RUN tsc

