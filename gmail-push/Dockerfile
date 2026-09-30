FROM node:22-alpine
ARG SOURCE_COMMIT=unknown
ENV APP_VERSION=$SOURCE_COMMIT
WORKDIR /app
COPY package.json server.mjs ./
RUN npm install --omit=dev
RUN addgroup -S naiemail && adduser -S naiemail -G naiemail && mkdir -p /data && chown -R naiemail:naiemail /app /data
USER naiemail
EXPOSE 8787
CMD ["node", "server.mjs"]
