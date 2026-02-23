# worker/Dockerfile
FROM node:22-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package.json .
RUN npm install --omit=dev

COPY . .

# Run as non-root for security
RUN adduser -D appuser
USER appuser

CMD ["node", "index.js"]