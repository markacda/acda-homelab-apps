#!/bin/sh
# Start busybox crond in the background so the daily logrotate job runs (see
# /etc/crontabs/root and /etc/logrotate.d/nginx-logviewer). nginx:alpine runs
# every /docker-entrypoint.d/*.sh before exec'ing nginx, so backgrounding crond
# here lets the entrypoint continue on to start nginx in the foreground.
crond -b -L /dev/stderr -c /etc/crontabs
