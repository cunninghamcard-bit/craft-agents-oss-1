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
#   ./scripts/build-and-deploy.sh                 # 构建 + 传镜像 + 同步配置/密钥 + 起容器
#   ./scripts/build-and-deploy.sh --build         # 只构建本机镜像（不传不部署）
#   ./scripts/build-and-deploy.sh --config-only   # 只同步配置/密钥并重启（不碰镜像）
#                                                 # 改了 .env / deploy/mihomo.yaml 用这个
# =============================================================================
set -euo pipefail

SERVER="${CRAFT_DEPLOY_SERVER:-ubuntu@124.222.62.164}"
PROXY="${BUILD_PROXY:-http://127.0.0.1:7897}"
IMAGE=craft-agents-full:latest
REMOTE_DIR=/opt/craft-docker
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_SRC="${SKILLS_SRC:-$HOME/Projects/procurement-agent/.agents/skills}"
cd "$ROOT"

# 把本机的配置 + 密钥同步到服务器（密钥不进 git，本机是唯一真相源 + 备份）。
# docker-compose.yml 进 git；.env / deploy/mihomo.yaml 是密钥（.gitignore）。
sync_config() {
  echo "==> 同步配置/密钥到 $SERVER:$REMOTE_DIR"
  local missing=0
  for f in .env deploy/mihomo.yaml; do
    [[ -f "$f" ]] || { echo "    !! 本机缺 $f（密钥文件），跳过——服务器上的保持不变" >&2; missing=1; }
  done
  # 暂存到 /tmp 再 sudo cp（REMOTE_DIR 属 root）
  scp docker-compose.yml "$SERVER:/tmp/dc.yml"
  ssh "$SERVER" "sudo cp /tmp/dc.yml $REMOTE_DIR/docker-compose.yml && rm /tmp/dc.yml"
  if [[ -f .env ]]; then
    scp .env "$SERVER:/tmp/craft.env"
    ssh "$SERVER" "sudo cp /tmp/craft.env $REMOTE_DIR/.env && rm /tmp/craft.env"
  fi
  if [[ -f deploy/mihomo.yaml ]]; then
    scp deploy/mihomo.yaml "$SERVER:/tmp/mihomo.yaml"
    ssh "$SERVER" "sudo mkdir -p $REMOTE_DIR/deploy && sudo cp /tmp/mihomo.yaml $REMOTE_DIR/deploy/mihomo.yaml && rm /tmp/mihomo.yaml"
  fi
  [[ "$missing" == 0 ]] && echo "    配置 + 密钥已同步" || echo "    配置已同步（部分密钥本机缺失，见上）"
}

# 只同步配置/密钥并重启，不构建/传镜像（改密钥用）
if [[ "${1:-}" == "--config-only" ]]; then
  sync_config
  echo "==> 服务器：重建容器（应用新配置/密钥）"
  ssh "$SERVER" "cd $REMOTE_DIR && sudo docker compose up -d"
  ssh "$SERVER" "sudo docker compose -f $REMOTE_DIR/docker-compose.yml ps"
  echo "==> 完成（仅配置）。"
  exit 0
fi

echo "==> [1/7] 暂存 skill 进 build context（build-skills/）"
rm -rf build-skills && mkdir -p build-skills
rsync -a --exclude=__pycache__ --exclude='*.pyc' "$SKILLS_SRC/" build-skills/
echo "    skills: $(ls build-skills | wc -l) 个"

echo "==> [2/7] docker build（--network=host，下载走 clash $PROXY）"
docker build --network=host \
  --build-arg HTTPS_PROXY="$PROXY" --build-arg HTTP_PROXY="$PROXY" \
  -f Dockerfile.full -t "$IMAGE" .

if [[ "${1:-}" == "--build" ]]; then
  echo "==> 只构建，完成。镜像：$IMAGE"
  exit 0
fi

echo "==> [3/7] 打包镜像（docker save | gzip）"
docker save "$IMAGE" | gzip > /tmp/craft-agents-full.tar.gz
echo "    大小：$(du -h /tmp/craft-agents-full.tar.gz | cut -f1)"

echo "==> [4/7] 传到服务器并加载"
scp /tmp/craft-agents-full.tar.gz "$SERVER:/tmp/"
ssh "$SERVER" "gunzip -c /tmp/craft-agents-full.tar.gz | sudo docker load && rm /tmp/craft-agents-full.tar.gz"

echo "==> [5/7] 同步配置/密钥"
sync_config

echo "==> [6/7] 服务器：起容器（compose 在 $REMOTE_DIR）"
ssh "$SERVER" "cd $REMOTE_DIR && sudo docker compose up -d"

echo "==> [7/7] 状态"
ssh "$SERVER" "sudo docker compose -f $REMOTE_DIR/docker-compose.yml ps"
echo "==> 完成。验证：curl -s -o /dev/null -w '%{http_code}\\n' https://agent.inotoday.asia/"
