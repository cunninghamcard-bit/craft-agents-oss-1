#!/usr/bin/env bash
# =============================================================================
# 全 Docker：本机构建镜像 → 打包 → 传服务器 → 加载 → 起容器。
#
# 前提：
#   - 本机已装 docker 且当前用户在 docker 组（docker ps 不用 sudo 能跑）
#   - 本机 clash 在 127.0.0.1:7897（构建时下载 GitHub/Chromium 走它）
#   - 已配 SSH 密钥免密登录服务器
#   - 服务器上已放好 docker-compose.yml + .env + deploy/mihomo.yaml（见 DOCKER.md 首次部署）
#
# 用法：
#   ./scripts/build-and-deploy.sh           # 构建 + 传 + 在服务器起容器
#   ./scripts/build-and-deploy.sh --build   # 只构建本机镜像（不传不部署）
# =============================================================================
set -euo pipefail

SERVER="${CRAFT_DEPLOY_SERVER:-ubuntu@124.222.62.164}"
PROXY="${BUILD_PROXY:-http://127.0.0.1:7897}"
IMAGE=craft-agents-full:latest
REMOTE_DIR=/opt/craft-docker
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="${SKILLS_SRC:-$HOME/Projects/procurement-agent/.agents/skills}"
cd "$ROOT"

echo "==> [1/6] 暂存 skill 进 build context（build-skills/）"
rm -rf build-skills && mkdir -p build-skills
rsync -a --exclude=__pycache__ --exclude='*.pyc' "$SKILLS_SRC/" build-skills/
echo "    skills: $(ls build-skills | wc -l) 个"

echo "==> [2/6] docker build（--network=host，下载走 clash $PROXY）"
docker build --network=host \
  --build-arg HTTPS_PROXY="$PROXY" --build-arg HTTP_PROXY="$PROXY" \
  -f Dockerfile.full -t "$IMAGE" .

if [[ "${1:-}" == "--build" ]]; then
  echo "==> 只构建，完成。镜像：$IMAGE"
  exit 0
fi

echo "==> [3/6] 打包镜像（docker save | gzip）"
docker save "$IMAGE" | gzip > /tmp/craft-agents-full.tar.gz
echo "    大小：$(du -h /tmp/craft-agents-full.tar.gz | cut -f1)"

echo "==> [4/6] 传到服务器并加载"
scp /tmp/craft-agents-full.tar.gz "$SERVER:/tmp/"
ssh "$SERVER" "gunzip -c /tmp/craft-agents-full.tar.gz | sudo docker load && rm /tmp/craft-agents-full.tar.gz"

echo "==> [5/6] 服务器：起容器（compose 在 $REMOTE_DIR）"
ssh "$SERVER" "cd $REMOTE_DIR && sudo docker compose up -d"

echo "==> [6/6] 状态"
ssh "$SERVER" "sudo docker compose -f $REMOTE_DIR/docker-compose.yml ps"
echo "==> 完成。验证：curl -s -o /dev/null -w '%{http_code}\\n' https://agent.inotoday.asia/"
