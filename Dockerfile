FROM kofile/node:carbon-alpine

LABEL MAINTAINER "Evan Sherwood <evan@sherwood.io>"

VOLUME ["/app/.git"]

COPY package.json yarn.lock ./
COPY semantic-release ./semantic-release/

RUN yarn install --production
COPY index.js github-release.js last-release-git.js README.md ./

ENTRYPOINT ["node", "index.js"]
