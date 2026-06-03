# 全 Docker 部署说明

这套文件就是「服务器上有什么」的单一事实来源——看这几个文件即知全貌，不用 SSH 去翻：

| 文件 | 回答什么问题 |
|---|---|
| `Dockerfile.full` | **装了什么**：bun/node/rg、应用代码+构建、lark-cli、CloakBrowser+Chromium、mihomo、skill |
| `docker-compose.yml` | **怎么跑**：哪几个容器（mihomo + craft-server）、挂哪些卷、暴露什么端口 |
| `.env`（从 `.env.docker.example` 复制） | **密钥**：server token、飞书 App Secret、域名 |
| `deploy/mihomo.yaml`（从 `.example` 复制） | **代理出口**：Clash 订阅 + 住宅代理账号 |

宿主机 `cloudflared`（systemd，保持不动）把 `127.0.0.1:9100` 经隧道暴露成 `https://agent.inotoday.asia`。

---

## 三类东西分别在哪（关键认知）

- **不可变环境**（可复现）→ 全在 `Dockerfile.full`，构建进镜像。
- **密钥**（绝不进镜像）→ `.env` + `deploy/mihomo.yaml`，运行时注入。
- **持久数据**（重启不丢）→ Docker 卷：`craft_data`（会话/配置）、`craft_lark`/`craft_lark_store`（lark-cli 登录态）。

---

## 日常更新（改代码/skill 后）

本机一条命令（需本机 docker + clash 7897 + SSH 免密）：
```bash
./scripts/build-and-deploy.sh
```
它会：暂存 skill → 构建镜像 → 打包 → 传服务器 → 加载 → `docker compose up -d`。

> 构建要 4G+ 内存、好网络（下 Chromium 走本机 clash）。**别在生产机上构建**。

---

## 首次切换（从现有 systemd 部署 → Docker，一次性，谨慎）

> 现有 systemd 部署（craft-agent/mihomo/craft-proxy）是好的。切 Docker 是一次有风险的迁移，按步来、可回滚。

1. **服务器放配置**：把 `docker-compose.yml`、`.env`（填好）、`deploy/mihomo.yaml`（填好订阅+住宅代理）放到服务器 `/opt/craft-docker/`。
2. **首次构建+传镜像**：本机 `./scripts/build-and-deploy.sh --build` 然后手动 save/load，或直接跑全量（见脚本）。
3. **停旧 systemd 服务**（腾出 9100）：
   ```bash
   sudo systemctl disable --now craft-agent mihomo craft-proxy
   ```
   （cloudflared 保留，它指向 127.0.0.1:9100，容器会接管这个端口。）
4. **起容器**：`cd /opt/craft-docker && sudo docker compose up -d`
5. **种入持久数据**（卷是空的，要初始化）：
   - **数据**：把旧 `/home/craft/.craft-agent` 拷进 `craft_data` 卷（`sudo docker cp` 或 `docker run --rm -v` 解压备份）。
   - **lark-cli 登录态**：把旧 `/home/craft/.lark-cli` 和 `/home/craft/.local/share/lark-cli` 拷进 `craft_lark`/`craft_lark_store` 卷。否则飞书 Base skill 要重新 `lark-cli auth login`。
   - **工作目录**：进 WebUI 把 workspace 工作目录设为 `/home/craftagents`（skill 是全局，脚本相对路径需 cwd=HOME）。
6. **验证**：`https://agent.inotoday.asia` 能登；`docker compose logs -f craft-server` 看日志；试一个国外采集（确认走 mihomo 住宅出口）。
7. **回滚**（出问题）：`docker compose down` + `sudo systemctl enable --now craft-agent mihomo craft-proxy`。

---

## 注意

- `.env` 和 `deploy/mihomo.yaml` 含密钥，已 `.gitignore`，别提交。
- `build-skills/`、`build-bin/` 是构建临时目录，已忽略。
- 镜像约 2-2.5G（Chromium 占大头），首次传服务器较慢（走 CN2，可接受）。
- 改 skill 也要重建镜像（baked in）——这是"整包可复现"的代价；想快速迭代 skill 可临时用 rsync 脚本覆盖卷/目录。
