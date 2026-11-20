# Ayden: one container serves the built web app and the API.
FROM node:22-slim AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npm run build
# the web app is optional until it is merged; the server checks for index.html
RUN mkdir -p apps/web/dist && npm prune --omit=dev

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 8080
CMD ["node", "apps/api/dist/server.js"]
