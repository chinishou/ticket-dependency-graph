#!/bin/sh
# daemon-entrypoint.sh — render the shotgunEvents config from env vars and
# exec the daemon. Runs under the unprivileged `sgevent` user.
set -eu

TEMPLATE=/etc/shotgunEvents/shotgunEventDaemon.conf.template
OUTPUT=/opt/shotgunEvents/src/shotgunEventDaemon.conf

# Required env vars. The `: "${VAR:?msg}"` form aborts with a clear error
# if any are missing so the daemon doesn't start with garbage config.
: "${SG_ED_SITE_URL:?SG_ED_SITE_URL must be set (SG site URL)}"
: "${SG_ED_SCRIPT_NAME:?SG_ED_SCRIPT_NAME must be set (SG script name)}"
: "${SG_ED_API_KEY:?SG_ED_API_KEY must be set (SG script key)}"

# Substitute %(VAR)s placeholders. We use sed instead of envsubst because the
# conf file's interpolation syntax (%(VAR)s) isn't what envsubst expects ($VAR).
# Also re-point pluginPaths from the example's placeholder to the real in-image path.
sed \
    -e "s|%(SG_ED_SITE_URL)s|${SG_ED_SITE_URL}|g" \
    -e "s|%(SG_ED_SCRIPT_NAME)s|${SG_ED_SCRIPT_NAME}|g" \
    -e "s|%(SG_ED_API_KEY)s|${SG_ED_API_KEY}|g" \
    -e "s|/path/to/shotgunEvents/src|/opt/shotgunEvents/src|g" \
    "${TEMPLATE}" > "${OUTPUT}"

# By default the example conf has emails enabled with a placeholder smtp host
# that will spam ERROR logs on every alert. Disable unless the operator has
# set SG_ED_EMAIL_ENABLED=true and provided a real server.
if [ "${SG_ED_EMAIL_ENABLED:-false}" != "true" ]; then
    sed -i 's/^enabled: True/enabled: False/' "${OUTPUT}"
fi

echo "Rendered config:"
echo "  SG site:     ${SG_ED_SITE_URL}"
echo "  Script name: ${SG_ED_SCRIPT_NAME}"
echo "  App API URL: ${APP_API_URL:-http://app:3001}"
echo "  Plugin path: /opt/shotgunEvents/src"
echo ""

# exec replaces the shell so PID 1 is the daemon — signals (SIGTERM from
# `docker stop`) reach the daemon directly instead of getting eaten by sh.
exec python shotgunEventDaemon.py "$@"
