# Thin image on top of the stock proxy: adds openssl + a startup script that
# generates a self-signed TLS cert on first boot (see generate-selfsigned-cert.sh),
# and logrotate + busybox crond to daily-rotate the JSON access log the Log Viewer
# reads. nginx:alpine already runs every *.sh in /docker-entrypoint.d/ before
# starting nginx, so we drop both startup scripts there and keep the default
# entrypoint (the crond one backgrounds itself so nginx still starts).
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
# openssl: first-boot cert generation. logrotate: daily gzip rotation of the JSON
# access log the Log Viewer reads (nginx has no built-in rotation), run by busybox
# crond. mkdir: the access-log dir must exist before nginx opens the file (the
# proxy-logs volume mounts over it at runtime) and logrotate needs a state dir.
RUN apk add --no-cache openssl logrotate \
  && mkdir -p /var/log/nginx/lv /var/lib/logrotate
COPY proxy/generate-selfsigned-cert.sh /docker-entrypoint.d/10-generate-selfsigned-cert.sh
COPY proxy/20-start-crond.sh /docker-entrypoint.d/20-start-crond.sh
RUN chmod +x /docker-entrypoint.d/10-generate-selfsigned-cert.sh /docker-entrypoint.d/20-start-crond.sh
COPY proxy/logrotate-nginx-logviewer /etc/logrotate.d/nginx-logviewer
COPY proxy/crontab-root /etc/crontabs/root
COPY proxy/nginx.conf /etc/nginx/conf.d/default.conf
COPY proxy/proxy_common /etc/nginx/proxy_common
