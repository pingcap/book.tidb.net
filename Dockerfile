FROM node:16-alpine

WORKDIR /home/node/app

COPY --chown=node:node ./website/ /home/node/app/

RUN yarn
RUN yarn build

USER node

EXPOSE 3000

CMD ["yarn", "serve"]


