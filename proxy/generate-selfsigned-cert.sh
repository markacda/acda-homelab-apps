#!/bin/sh
# Generate a self-signed TLS cert for the proxy on first boot, into the
# persistent /etc/nginx/certs volume. Idempotent: if a cert already exists it is
# reused, so the cert survives restarts and is only created once. Set TLS_SAN
# (comma-separated openssl subjectAltName entries) to name the Pi's host/IP,
# e.g. TLS_SAN=DNS:localhost,IP:127.0.0.1,IP:192.168.1.50
set -e

CERT_DIR=/etc/nginx/certs
SAN="${TLS_SAN:-DNS:localhost,IP:127.0.0.1}"

if [ ! -f "$CERT_DIR/privkey.pem" ]; then
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out    "$CERT_DIR/fullchain.pem" \
    -subj   "/CN=homelab" \
    -addext "subjectAltName=$SAN"
  echo "Generated self-signed cert in $CERT_DIR (SAN: $SAN)"
fi
