# Thin image on top of the stock proxy: adds openssl and a startup script that
# generates a self-signed TLS cert on first boot (see generate-selfsigned-cert.sh).
# nginx:alpine already runs every *.sh in /docker-entrypoint.d/ before starting
# nginx, so we just drop the script there and keep the default entrypoint.
#
# Build context is the repo root (docker build -f proxy/Dockerfile .), matching
# every app, so the COPY paths below are repo-relative.
#
# The routing config is COPIED into the image (not volume-mounted) on purpose:
# baking it in means editing nginx.conf/proxy_common changes the image, so a plain
# `docker compose up -d --build` recreates the proxy and nginx loads the new config.
# A bind mount would leave the running container (and its in-memory config) stale
# until an explicit --force-recreate.
FROM nginx:alpine
RUN apk add --no-cache openssl
COPY proxy/generate-selfsigned-cert.sh /docker-entrypoint.d/10-generate-selfsigned-cert.sh
RUN chmod +x /docker-entrypoint.d/10-generate-selfsigned-cert.sh
COPY proxy/nginx.conf /etc/nginx/conf.d/default.conf
COPY proxy/proxy_common /etc/nginx/proxy_common
