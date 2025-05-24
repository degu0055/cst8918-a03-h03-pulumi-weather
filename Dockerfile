# Base node image
FROM node:lts-alpine AS base

# Update openssl package to apply security patch (CVE-2023-6129)
RUN apk -U add --update-cache openssl

# Set environment for all stages
ENV NODE_ENV=production

# Install all node_modules including dev dependencies
FROM base AS deps

WORKDIR /usr/src/app

ADD package.json package-lock.json ./
RUN npm install --include=dev

# Setup production node_modules
FROM base AS production-deps

WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules /usr/src/app/node_modules
ADD package.json package-lock.json ./
RUN npm prune --omit=dev

# Build the app
FROM base AS build

WORKDIR /usr/src/app

COPY --from=deps /usr/src/app/node_modules /usr/src/app/node_modules
ADD . .
RUN npm run build

# Final production image
FROM base

WORKDIR /usr/src/app

COPY --from=production-deps /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=build /usr/src/app/build /usr/src/app/build
COPY --from=build /usr/src/app/public /usr/src/app/public
COPY --from=build /usr/src/app/package.json /usr/src/app/package.json

CMD ["npx", "remix-serve", "./build/index.js"]
