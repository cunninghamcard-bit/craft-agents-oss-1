#!/usr/bin/env bash
# =============================================================================
# 一键部署 craft-agents-oss 到生产服务器。
#
# 用法：
#   ./scripts/deploy.sh          # 完整：重建 webui + 子进程 bundle，同步，装依赖，重启
#   ./scripts/deploy.sh --fast   # 跳过 webui 重建（只改了服务端 TS 时用，快）
#
# 前提：本机已配 SSH 密钥免密登录服务器（ssh ubuntu@<server> 不需密码）。
# 服务器地址可用环境变量覆盖：CRAFT_DEPLOY_SERVER=ubuntu@1.2.3.4 ./scripts/deploy.sh
# =============================================================================
set -euo pipefail

SERVER="${CRAFT_DEPLOY_SERVER:-ubuntu@124.222.62.164}"
APP_DIR=/opt/craft-agents
STAGING=/tmp/craft-deploy-staging
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAST=0
[[ "${1:-}" == "--fast" ]] && FAST=1

echo "==> [1/5] 构建子进程 bundle"
bun run server:build:subprocess >/dev/null

if [[ $FAST -eq 0 ]]; then
  echo "==> [2/5] 构建 WebUI（--fast 可跳过）"
  NODE_OPTIONS="--max-old-space-size=4096" bun run webui:build >/dev/null
else
  echo "==> [2/5] --fast：跳过 WebUI 构建"
fi

echo "==> [3/5] rsync 到 $SERVER:$STAGING"
rsync -az --delete \
  --exclude=node_modules --exclude=.git --exclude='*.map' \
  ./ "$SERVER:$STAGING/"

echo "==> [4/5] 服务器：同步到 $APP_DIR + 装依赖"
ssh "$SERVER" "set -e
  sudo rsync -a --delete --exclude=node_modules '$STAGING/' '$APP_DIR/'
  sudo chown -R craft:craft '$APP_DIR'
  sudo -u craft bash -lc 'cd $APP_DIR && BUN_CONFIG_REGISTRY=https://registry.npmmirror.com /usr/local/bin/bun install --frozen-lockfile >/dev/null'
"

echo "==> [5/5] 重启 craft-agent"
ssh "$SERVER" "sudo systemctl restart craft-agent; sleep 4; echo \"craft-agent: \$(systemctl is-active craft-agent)\""

echo "==> 完成。数据目录 /home/craft/.craft-agent 不受影响。"
