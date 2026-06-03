#!/bin/sh
# Entrypoint for the full image. Starts as root to fix ownership of mounted
# volumes (data dir + lark-cli auth dirs), then drops to craftagents via gosu.
set -e

if [ "$(id -u)" = "0" ]; then
  for d in \
    "${CRAFT_CONFIG_DIR:-/home/craftagents/.craft-agent}" \
    "/home/craftagents/.lark-cli" \
    "/home/craftagents/.local/share/lark-cli"; do
    mkdir -p "$d"
    chown -R craftagents:craftagents "$d"
  done
  exec gosu craftagents "$@"
fi

exec "$@"
