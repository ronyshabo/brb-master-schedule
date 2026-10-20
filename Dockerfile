# syntax=docker/dockerfile:1.6

# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
# Secrets are mounted at /run/secrets/ and never stored in any image layer
RUN --mount=type=secret,id=VITE_FIREBASE_API_KEY \
	--mount=type=secret,id=VITE_FIREBASE_AUTH_DOMAIN \
	--mount=type=secret,id=VITE_FIREBASE_PROJECT_ID \
	--mount=type=secret,id=VITE_FIREBASE_STORAGE_BUCKET \
	--mount=type=secret,id=VITE_FIREBASE_MESSAGING_SENDER_ID \
	--mount=type=secret,id=VITE_FIREBASE_APP_ID \
	/bin/sh -c 'export VITE_FIREBASE_API_KEY="$(cat /run/secrets/VITE_FIREBASE_API_KEY)" && \
	export VITE_FIREBASE_AUTH_DOMAIN="$(cat /run/secrets/VITE_FIREBASE_AUTH_DOMAIN)" && \
	export VITE_FIREBASE_PROJECT_ID="$(cat /run/secrets/VITE_FIREBASE_PROJECT_ID)" && \
	export VITE_FIREBASE_STORAGE_BUCKET="$(cat /run/secrets/VITE_FIREBASE_STORAGE_BUCKET)" && \
	export VITE_FIREBASE_MESSAGING_SENDER_ID="$(cat /run/secrets/VITE_FIREBASE_MESSAGING_SENDER_ID)" && \
	export VITE_FIREBASE_APP_ID="$(cat /run/secrets/VITE_FIREBASE_APP_ID)" && \
	npm run build'

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/http.conf
COPY nginx.https.conf /etc/nginx/templates/https.conf
COPY docker-entrypoint.d/10-setup-https.sh /docker-entrypoint.d/10-setup-https.sh
RUN chmod +x /docker-entrypoint.d/10-setup-https.sh
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
