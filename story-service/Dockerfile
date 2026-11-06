FROM node:24-alpine
WORKDIR /app/story-service
COPY story-service/package.json story-service/package-lock.json ./
COPY story-service/vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY story-service/src ./src
COPY story-service/build.mjs ./
COPY shared /app/shared
RUN npm run build
ENV STORY_HOST=0.0.0.0
ENV STORY_DATA_DIR=/data/stories
EXPOSE 3002
CMD ["node", "--import", "tsx", "src/index.ts"]
