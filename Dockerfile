# Container for Google Cloud Run (used by Google AI Studio's deploy, or `gcloud run deploy --source .`).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
# Cloud Run sets PORT (usually 8080); `next start` listens on it.
EXPOSE 8080
CMD ["npm", "start"]
