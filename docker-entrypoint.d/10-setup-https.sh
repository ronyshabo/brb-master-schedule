#!/bin/sh
set -eu

HTTP_CONF="/etc/nginx/templates/http.conf"
HTTPS_CONF="/etc/nginx/templates/https.conf"
TARGET_CONF="/etc/nginx/conf.d/default.conf"
CERT_FILE="/etc/nginx/certs/fullchain.pem"
KEY_FILE="/etc/nginx/certs/privkey.pem"

if [ "${ENABLE_HTTPS:-false}" = "true" ] && [ -f "$CERT_FILE" ] && [ -f "$KEY_FILE" ]; then
  cp "$HTTPS_CONF" "$TARGET_CONF"
  echo "HTTPS enabled with mounted certificates."
else
  cp "$HTTP_CONF" "$TARGET_CONF"
  echo "HTTPS not enabled (set ENABLE_HTTPS=true and mount certs to /etc/nginx/certs). Serving HTTP only."
fi
