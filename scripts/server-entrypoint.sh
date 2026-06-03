#!/bin/sh
# =============================================================================
# Container entrypoint for the Craft Agents Server.
#
# A freshly-mounted persistent volume (Fly.io, Docker named volume, k8s PVC)
# is owned by root, but the server must run as the unprivileged `craftagents`
# user (the Claude Code SDK refuses to run as root). So when we start as root,
# fix ownership of the config dir, then drop privileges via gosu.
#
# When started as a non-root user (e.g. `docker run --user $(id -u):$(id -g)`),
# there is nothing to fix and nothing to drop — just exec the command.
# =============================================================================
set -e

CONFIG_DIR="${CRAFT_CONFIG_DIR:-/home/craftagents/.craft-agent}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$CONFIG_DIR"
  chown -R craftagents:craftagents "$CONFIG_DIR"
  exec gosu craftagents "$@"
fi

exec "$@"
