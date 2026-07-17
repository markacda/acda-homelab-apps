# Thin image on top of the stock proxy: adds openssl and a startup script that
# generates a self-signed TLS cert on first boot (see generate-selfsigned-cert.sh).
# nginx:alpine already runs every *.sh in /docker-entrypoint.d/ before starting
# nginx, so we just drop the script there and keep the default entrypoint.
#
# Build context is the repo root (docker build -f proxy/Dockerfile .), matching
# every app, so the COPY path below is repo-relative. nginx.conf and proxy_common
# stay volume-mounted (see docker-compose.yml) so edits apply without a rebuild.
FROM nginx:alpine
RUN apk add --no-cache openssl
COPY proxy/generate-selfsigned-cert.sh /docker-entrypoint.d/10-generate-selfsigned-cert.sh
RUN chmod +x /docker-entrypoint.d/10-generate-selfsigned-cert.sh
