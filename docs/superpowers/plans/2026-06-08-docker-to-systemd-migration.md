# Docker → systemd 迁移计划（恢复裸机直跑，提速迭代）

> 目标：把生产 craft-agents 主服务从 Docker 全量镜像部署，切回 `craft` 用户 + systemd 直跑（`bun run` 直接跑 TS），迭代循环变成「本机构建 → rsync → `systemctl restart`」秒级。**铁律：不断线、不丢数据、Docker 留作回滚后路。**

## 现状（已核实）

- 服务器 `ubuntu@124.222.62.164`，Ubuntu 22.04 x86_64，**内存仅 3.3G（可用 ~2.1G）** → **服务器不能跑 `vite build`，构建必须在本机做**。
- 宿主机已装 `bun 1.3.14`、`node v20.19`、`cloudflared`、`docker`。缺 `uv`/`lark-cli`/`cloakbrowser`。
- 旧 systemd 蓝图仍在（disabled）：`craft-agent.service`（user `craft`，WD `/opt/craft-agents`，`bun run packages/server/src/index.ts`，EnvFile `/etc/craft-agent.env`）、`mihomo.service`（`/usr/local/bin/mihomo -d /etc/mihomo -f /etc/mihomo/config.yaml`）、`craft-proxy.service`（**本次不用**）。
- `/opt/craft-agents` 仍在（2.0G，含 node_modules）。
- 现网数据在 Docker 卷：`craft_data`(13M)=`~/.craft-agent`、`craft_lark`=`~/.lark-cli`、`craft_lark_store`=`~/.local/share/lark-cli`。
- `credentials.enc` 加密 key 由 **machine-id 派生**（`1c3442ab...`）；同机裸机跑 → 解密成立。
- cloudflared `config.yml`：`service: http://localhost:9100`（Docker / systemd 谁听 9100 都行）。
- `deploy/mihomo.yaml`：`mixed-port: 7899`，订阅 `proxy-providers` + socks5:443 自带出口，**不依赖 1080/美国机**。

## 决策（已确认）

- searxng：**单独留在 Docker** 跑；改为发布到 `127.0.0.1:8080`，app 指 `http://127.0.0.1:8080`。
- 代理：**原生 mihomo + 现有 `deploy/mihomo.yaml`**，app `HTTP(S)_PROXY=http://127.0.0.1:7899`。
- cloakbrowser + uv：**押后**（海外采集 `procurement-platform-search` 等暂不可用，其余不受影响）。
- lark-cli：**必装**（飞书系列 skill 依赖），登录态从 `craft_lark_store` 迁。
- 运行身份：复用 `craft` + `/opt/craft-agents`。
- 切换：因内存紧张不真并行；用临时端口验证后做**短停机窗口**切换，Docker app 停而不删做回滚。

## 运行时环境映射（Docker → systemd）

写入 `/etc/craft-agent.env`（含 `.env` 里的密钥：DeepSeek key、飞书 Secret、隧道 token、`SEARXNG_SECRET_KEY` 等），并补这些 CRAFT_*：

```
CRAFT_RPC_HOST=0.0.0.0
CRAFT_RPC_PORT=9100
CRAFT_CONFIG_DIR=/home/craft/.craft-agent
CRAFT_DEFAULT_WORKSPACE_PATH=/home/craft
CRAFT_WEBUI_DIR=/opt/craft-agents/apps/webui/dist
CRAFT_BUNDLED_ASSETS_ROOT=/opt/craft-agents
CRAFT_IS_PACKAGED=false
CRAFT_MESSAGING_WA_WORKER=/opt/craft-agents/packages/messaging-whatsapp-worker/dist/worker.cjs
CRAFT_MESSAGING_NODE_BIN=node
HOME=/home/craft
HTTP_PROXY=http://127.0.0.1:7899
HTTPS_PROXY=http://127.0.0.1:7899
NO_PROXY=localhost,127.0.0.1,::1,api.deepseek.com,.deepseek.com,.feishu.cn,open.feishu.cn,.larksuite.com,.feishucdn.com,.szlcsc.com,.ickey.cn,.hqew.com
LARK_CLI_NO_PROXY=1
CRAFT_WEBUI_SECURE_COOKIE=true
SEARXNG_URL=http://127.0.0.1:8080
```

`CLOAKBROWSER_PROXY` 暂略（未装）。skill 脚本所需 `python`/`fd` 软链与 `permissions.json` 同 Docker 处理。

---

## 阶段与步骤

### 阶段 0：保留后路 + 预检（不改服务器）

- [ ] 等后台 Docker 部署 `build-and-deploy.sh` 跑完——这次 system prompt 修复先在 Docker 上线，并作为干净回滚点。
- [ ] 只读预检：`craft` 用户存在？`/home/craft` 在？`/etc/craft-agent.env` 现有内容？`/usr/local/bin/mihomo` 在？`/etc/mihomo/` 在？`/opt/craft-agents` 属主？`/usr/local/bin/bun` 还是 PATH 里的 bun？

### 阶段 1：仓库内产出（本机，零服务器影响）

- [ ] `deploy/systemd/craft-agent.service`：基于旧 unit，确认 `ExecStart` 用实际 bun 路径，`EnvironmentFile=/etc/craft-agent.env`，`User=craft`，`WorkingDirectory=/opt/craft-agents`，`Restart=always`。
- [ ] `deploy/systemd/mihomo.service`：`/usr/local/bin/mihomo -d /etc/mihomo -f /etc/mihomo/config.yaml`。
- [ ] `scripts/quick-deploy.sh`：本机 `bun install`(按需) + 4 个 build（session-mcp-server / pi-agent-server / wa-worker / `vite build` webui）→ `rsync -a --delete` 源码与 dist 到 `craft@server:/opt/craft-agents/`（排除 `.git`/`node_modules`/`build-skills` 视情况）+ rsync 真源 skill 到 `/home/craft/.agents/skills/` → `ssh ... sudo systemctl restart craft-agent`。
- [ ] commit。

### 阶段 2：服务器侧加性准备（不动 Docker app）

- [ ] 装 lark-cli：`sudo BUN_INSTALL=/usr/local bun install -g @larksuite/cli@1.0.40`，验证 `lark-cli --version`。
- [ ] `python`/`fd` 软链（若缺）。
- [ ] 本机构建 → rsync 全量源码 + dist 到 `/opt/craft-agents`（覆盖旧 2.0G 代码），rsync skill 到 `/home/craft/.agents/skills/`，放 `permissions.json` 到 `/home/craft/permissions.json`，`chown -R craft:craft`。
- [ ] 写 `/etc/craft-agent.env`（上面的映射，密钥取自本机 `.env`）。
- [ ] 装 `deploy/mihomo.yaml` 到 `/etc/mihomo/config.yaml`，装 unit，`systemctl enable --now mihomo`，验证 `curl -x http://127.0.0.1:7899 -s -o /dev/null -w '%{http_code}' https://www.gstatic.com/generate_204` = 204。
- [ ] searxng 改发布到宿主回环：compose 里 searxng 加 `ports: ["127.0.0.1:8080:8080"]`，`docker compose up -d searxng`，验证 `curl -s 127.0.0.1:8080` 通。

### 阶段 3：数据迁移（可逆，Docker 卷保留）

- [ ] 临时端口验证：`/etc/craft-agent.env` 里 `CRAFT_RPC_PORT=9101`。
- [ ] 复制卷数据到 craft 家目录（**复制不移动**，Docker 卷原样保留作后路）：
      `sudo rsync -a /var/lib/docker/volumes/craft-docker_craft_data/_data/ /home/craft/.craft-agent/`
      同样迁 `craft_lark`→`/home/craft/.lark-cli/`、`craft_lark_store`→`/home/craft/.local/share/lark-cli/`，`chown -R craft:craft`。
- [ ] 装 `craft-agent.service`，`systemctl start craft-agent`（端口 9101，与 Docker 9100 不冲突）。
- [ ] 验证：`journalctl -u craft-agent` 无致命错；`curl 127.0.0.1:9101` webui 出；**确认 credentials.enc 解密成功**（DeepSeek 连接可用，日志无 decrypt 报错）；飞书 lark-cli 登录态有效。

### 阶段 4：切换（短停机窗口）

- [ ] `/etc/craft-agent.env` 改回 `CRAFT_RPC_PORT=9100`。
- [ ] 停 Docker app 释放 9100：`sudo docker compose stop craft-server`（mihomo 容器可一并停，searxng 留着；原生 mihomo 已接管）。
- [ ] `systemctl restart craft-agent`（听 9100）。cloudflared 不动。
- [ ] 验证生产：`curl -s -o /dev/null -w '%{http_code}' https://agent.inotoday.asia/`；飞书发一条测试消息走通；试触发一个 skill（验证 `<available_skills>` 自动触发 + 新描述）。
- [ ] `systemctl enable craft-agent`（开机自起）。
- [ ] 若异常：`systemctl stop craft-agent && docker compose start craft-server` 秒级回滚。

### 阶段 5：收尾（稳定后/另起）

- [ ] 稳定数日后：`docker compose rm` 删 Docker app 容器（卷暂留）。
- [ ] 需要海外采集时再补：`uv` + `cloakbrowser install`（经 mihomo 下 Chromium）+ `cloudflared` 无关。
- [ ] 之后日常迭代：改代码 → `./scripts/quick-deploy.sh`。

## 风险

- **数据/凭证**：machine-id 同机不变，理论可解密；阶段 3 用临时端口 + 保留 Docker 卷，验证失败可秒退。
- **内存 3.3G**：避免 Docker app 与 systemd app 同时 9100；切换走短停机窗口而非真并行。
- **lark 登录态**：若迁移后飞书 token 失效，需 `lark-cli` 重新登录（交互，需你操作）。
- **searxng 端口**：从 `expose` 改 `ports` 发布到回环，不外露。
