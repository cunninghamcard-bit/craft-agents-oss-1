# 部署与维护手册（生产环境）

本文档对应**已上线**的部署，记录架构、日常运维、升级、备份和排错。

> Skill（procurement-agent）、lark-cli、CloakBrowser、海外代理的部署细节见末尾「十、Skill 与采集能力」。

---

## 一、它现在长什么样（架构）

```
飞书/浏览器
   │ https://agent.inotoday.asia        ← Cloudflare 自动 HTTPS
   ▼
Cloudflare 边缘（圣何塞 sjc）
   │ 加密隧道（cloudflared 出站，无需开端口）
   ▼
腾讯云上海 VM  124.222.62.164  (Ubuntu 22.04, 4C4G)
   ├─ systemd: cloudflared        隧道连接器
   └─ systemd: craft-agent        Bun 服务 (127.0.0.1:9100, 含 WebUI)
        └─ Pi/agent 子进程、AI 调用 → DeepSeek API（国内直连）
```

关键事实：
- **服务器在境内**，但走 Cloudflare Tunnel，**未备案**。`agent` 解析归 Cloudflare 管。
- 服务只监听 `127.0.0.1:9100`，**公网不直接暴露**，只能经隧道进来。
- AI 用 **DeepSeek**（国内可直连）。OpenAI / Google 在这台机器上被墙；Anthropic 目前能连但不稳定。
- 应用以非 root 用户 **`craft`** 运行（Claude SDK 拒绝 root）。

---

## 二、关键位置速查

| 东西 | 路径 / 名称 |
|---|---|
| 登录服务器 | `ssh ubuntu@124.222.62.164`（密码登录，sudo 免密） |
| 应用代码 | `/opt/craft-agents`（属主 `craft`） |
| **数据目录（命根子）** | `/home/craft/.craft-agent`（配置、会话、workspace 全在这） |
| 应用环境变量 | `/etc/craft-agent.env` |
| 应用服务 | `systemctl ... craft-agent` |
| 隧道配置 | `/etc/cloudflared/config.yml` |
| 隧道服务 | `systemctl ... cloudflared` |
| 运行时 | bun → `/usr/local/bin/bun`，node20 → `/usr/local/bin/node`，rg → `/usr/bin/rg` |

> **心智模型：代码和容器随时可重建，`/home/craft/.craft-agent` 丢了就全没了。** 维护的核心就是保住它 + 出事看日志。

---

## 三、日常运维（最常用）

```bash
ssh ubuntu@124.222.62.164          # 登上去

# 看状态
systemctl status craft-agent
systemctl status cloudflared

# 看日志（排查 90% 靠这个）
sudo journalctl -u craft-agent -n 100 --no-pager
sudo journalctl -u craft-agent -f          # 实时跟踪
sudo journalctl -u cloudflared -n 50 --no-pager

# 重启
sudo systemctl restart craft-agent
sudo systemctl restart cloudflared

# 看资源（1G→4G 已不紧张，但仍要留意）
free -h
df -h /
```

健康自检：
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9100/    # 应为 302
curl -s -o /dev/null -w "%{http_code}\n" https://agent.inotoday.asia/   # 公网，应为 302
```

---

## 四、升级到新版本（改了代码后重新部署）

代码用 **本机构建 → rsync → 服务器装依赖 → 重启** 的模式（服务器内存够，也可在服务器上构建，但本机更快）。在**本机仓库**目录执行：

```bash
# 1. 本机构建产物
bun install
bun run server:build:subprocess
NODE_OPTIONS="--max-old-space-size=4096" bun run webui:build

# 2. 传到服务器（排除 node_modules/.git/source-map）
rsync -az --delete --exclude=node_modules --exclude=.git --exclude='*.map' \
  -e 'sshpass -e ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no' \
  ./ ubuntu@124.222.62.164:/opt/craft-agents/
# （sshpass 需先 export SSHPASS=...；或换成 SSH 密钥免密）

# 3. 服务器装依赖（用国内镜像）+ 重启
ssh ubuntu@124.222.62.164 '
  sudo chown -R craft:craft /opt/craft-agents
  cd /opt/craft-agents && BUN_CONFIG_REGISTRY=https://registry.npmmirror.com /usr/local/bin/bun install --frozen-lockfile
  sudo systemctl restart craft-agent'
```

> 数据目录 `/home/craft/.craft-agent` 不受升级影响，配置/会话不丢。

---

## 五、备份（唯一重要的主动维护）

只需备份数据目录。**每周一次**即可：

```bash
ssh ubuntu@124.222.62.164 'sudo tar czf - -C /home/craft .craft-agent' > craft-backup-$(date +%F).tar.gz
```

恢复（换机器或灾难恢复）：
```bash
# 新机器装好运行时 + 代码后：
cat craft-backup-XXXX.tar.gz | ssh ubuntu@新IP 'sudo tar xzf - -C /home/craft && sudo chown -R craft:craft /home/craft/.craft-agent'
sudo systemctl restart craft-agent
```

腾讯云控制台也可以给整台机器做**快照**（更省事，连系统一起备），建议开自动快照。

---

## 六、改配置 / 换 AI 凭证

- **改环境变量**（端口、域名、Feishu 开关等）：编辑 `/etc/craft-agent.env`（`sudo`），然后 `sudo systemctl restart craft-agent`。
- **换 AI 提供方 / key**：在 WebUI 里「设置 → LLM 连接」改，不用动服务器。
  - 本机器可直连：**DeepSeek**（在用）。OpenAI/Gemini 被墙；Anthropic 时通时断。

---

## 七、本部署特有的坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 公网打不开，但 `127.0.0.1:9100` 通 | cloudflared 挂了 | `sudo systemctl restart cloudflared`，看日志 |
| 整个域名解析不了 | `.asia` **实名认证**没过被注册局停 | 腾讯云补实名认证 |
| AI 报超时 | 选了被墙的提供方(OpenAI/Gemini)，或 Anthropic 抽风 | 用 DeepSeek；或给服务器挂代理 |
| WebUI 转圈连不上后端 | `CRAFT_WEBUI_WS_URL` 不对 | 须为 `wss://agent.inotoday.asia` |
| agent 报 `piServerPath not configured` | `CRAFT_IS_PACKAGED` 被设成 true | 必须是 `false`（源码部署模式） |
| 国内访问慢 | Cloudflare 走海外边缘 | 这是免备案的代价；要满速需备案后改直连 |

---

## 八、待办 / 风险（建议尽快处理）

- [ ] **改密码**：root 密码、ubuntu 密码、服务器 token 都曾出现在聊天记录里。腾讯云控制台重置实例密码，并考虑改用 **SSH 密钥**登录（更安全，也省去 sshpass）。
- [ ] **完成 `.asia` 域名实名认证**，否则几天后解析被停。
- [ ] **应急登录 token** 存在 `/etc/craft-agent.env` 的 `CRAFT_SERVER_TOKEN`（用 `sudo cat` 查），妥善保管。
- [ ] 可选：接入**飞书免密登录**——在 `/etc/craft-agent.env` 加 `CRAFT_FEISHU_AUTH_ENABLED=true` / `CRAFT_FEISHU_APP_ID` / `CRAFT_FEISHU_APP_SECRET`，并在飞书开放平台把主页设为 `https://agent.inotoday.asia`、加可信域名。
- [ ] 可选：腾讯云开**自动快照**，多一层兜底。
- [ ] 那台**美国 1G 机器**（之前的试验机）若不用了，可关停省资源。

---

## 九、一句话总结

**四个 systemd 服务 + 一个数据目录。** 出事先 `journalctl` 看日志，重启大多能解决；定期备份 `/home/craft/.craft-agent`；别动 nameserver 和 `CRAFT_IS_PACKAGED=false`。

四个服务及职责：
| 服务 | 职责 |
|---|---|
| `craft-agent` | 主服务（Bun，127.0.0.1:9100，含 WebUI） |
| `cloudflared` | 公网 HTTPS 隧道 |
| `craft-proxy` | SSH 动态转发到美国机，绕 GFW，本地 SOCKS5 `127.0.0.1:1080` |
| `mihomo` | 代理链：经 craft-proxy 绕 GFW → 住宅代理出口，本地 `127.0.0.1:7899`（采集用） |

---

## 十一、未来优化（规划，未实施）

### 采集能力外置为独立服务
当前 CloakBrowser + Chromium 作为子进程跑在主服务器上，与 agent 抢内存（每个浏览器 ~835MB，4C4G 上约 2-3 个并发封顶）。计划抽成独立的「采集服务」：

```
craft-agent(主服务，保持精简)
   │ HTTP: POST /scrape {part, platforms}
   ▼
采集服务(独立大内存机, 8G+)
   ├─ CloakBrowser + Chromium（内置并发队列/上限）
   ├─ mihomo 住宅代理链
   └─ 返回 JSON 证据
```
- skill 脚本由「本地起浏览器」改为「HTTP 调采集服务」（`run_collectors.py` 变瘦客户端）。
- 收益：内存隔离（主服务不再被 Chromium 拖累）、独立扩容、集中并发控制（防多人同时采集打爆机器）、多租户共用、主服务器无需装 uv/CloakBrowser/Chromium。
- 待定：采集服务放哪（需 8G+ 内存 + 能走住宅代理链 + 最好在 GFW 外；美国 1G 机太小，需单独开机/容器）。

### 其他规划
- **多租户**：当前单 workspace 全员共享；将来按用户/组路由到独立 workspace + 数据隔离。skill 已放全局（产品能力共享），数据侧做隔离即可。
- **并发闸**（外置采集服务前的过渡）：在主服务限制全局同时运行的 CloakBrowser 数，超出排队，防 OOM。

## 十、Skill 与采集能力（procurement-agent）

### 部署位置（全局 skill —— 单站点 / 共享能力模型）
- skill 放在**全局** `/home/craft/.agents/skills/`（属主 craft），7 个 skill。全局 skill **不依赖工作目录就always加载/显示**（loadAllSkills 总是扫 `~/.agents/skills`）。
- 设计取舍：skill = **产品能力**（所有租户共享），workspace/数据 = **租户隔离**。所以单站点 + 将来多租户都把 skill 放全局；不要绑到某个 workspace 目录（否则多租户每户得各放一份）。
- workspace 默认工作目录设为 **`/home/craft`**（`/home/craft/.craft-agent/workspaces/default/config.json` 的 `defaults.workingDirectory`）。原因：SKILL.md 里脚本用 cwd 相对路径 `.agents/skills/.../scripts/...`，cwd=HOME 才能解析到 `~/.agents/skills`。
- 源码侧（craft-agents 仓库）已让 `headless-start.ts` 开机种 workspace；工作目录是 workspace 配置，不在代码里。

### 更新 skill
源头是本机 `procurement-agent` 仓库的 `.agents/skills/`，部署到服务器**全局目录**：
```bash
cd /home/cunningham/Projects/procurement-agent
rsync -az --delete --exclude=__pycache__ \
  -e 'sshpass -e ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no' \
  .agents/skills/ ubuntu@124.222.62.164:/tmp/global-skills-staging/
ssh ubuntu@124.222.62.164 'sudo rsync -a --delete /tmp/global-skills-staging/ /home/craft/.agents/skills/ && sudo chown -R craft:craft /home/craft/.agents'
```
（skill 文件改动 5 分钟缓存生效，或 `sudo systemctl restart craft-agent` 立即生效。）

> 注：`/home/craft/procurement-agent` 旧的项目级副本已不再是激活来源（工作目录已指向 HOME，只认全局 `~/.agents/skills`）。可删可留，避免和全局副本混淆，建议以后只更新全局这份。

### lark-cli（4 个飞书 skill 依赖）
- 包：`@larksuite/cli@1.0.40`，装在 craft 的 `/home/craft/.bun/bin/lark-cli`，已加入服务 `PATH`（`/etc/craft-agent.env`）。
- 凭证：`/home/craft/.lark-cli/config.json` + `/home/craft/.local/share/lark-cli/*`（含 `master.key`，从本机拷贝而来）。
- 认证检查：`sudo -u craft bash -lc 'export HOME=/home/craft PATH=/home/craft/.bun/bin:$PATH; lark-cli auth status'`
- ⚠️ **token 过期要重登**：Feishu 刷新令牌约 30 天有效。失效后在服务器跑 `lark-cli auth login`（设备码流程，给 URL+码，在浏览器授权），或从本机重新拷贝凭证。

### CloakBrowser + 住宅代理链（3 个国外采集 skill）——已打通，自动过 Cloudflare

**结论**：经实测，机房 IP 无论怎么调都过不了 Cloudflare（无头被识破 + 机房 IP 被重点验证）；**换住宅 IP 后无头自动过**。所以走「住宅代理」是关键。

组件：
- **CloakBrowser**：`uv tool install`（craft，带 `httpx[socks]` + `geoip2`），命令 wrapper `/usr/local/bin/cloakbrowser-python`，Chromium 在 `/home/craft/.cloakbrowser/`，系统库已 `playwright install-deps`。
- **代理链**（关键）：
  ```
  采集脚本 → mihomo(127.0.0.1:7899) → craft-proxy(SSH→美国机,绕GFW) → 住宅代理(LA) → 目标站
                                                                         ↑ 住宅出口 IP,Cloudflare 自动放行
  ```
  为什么要两跳：住宅代理在美国，上海机房直连它会被 **GFW 干扰**（TCP 通但 SOCKS 会话 EOF）；先经美国机（craft-proxy）绕过 GFW，再连住宅代理。mihomo 用 `dialer-proxy` 实现这个链（配置 `/etc/mihomo/config.yaml`，权限 600，含住宅代理账号密码）。
- **接线方式（免维护）**：三个采集脚本都改成「`--proxy` 未给时回退读环境变量 `CLOAKBROWSER_PROXY`」。服务器 `/etc/craft-agent.env` 里设了 `CLOAKBROWSER_PROXY=http://127.0.0.1:7899`，agent 跑技能时子进程自动继承 → **国外采集器自动走住宅链，无需任何人加参数**。
- **国内采集器自动跳过代理**：`run_collectors.py` 里 `DOMESTIC_COLLECTORS = {lcsc, yunhan, hqew}` 这几个不走代理（直连更快、省住宅流量）。

实测验证（不带 --proxy，靠环境变量）：digikey 自动过验证拿到价格；lcsc 立创直连拿到 12 条价格。

维护要点：
- **换住宅代理**：编辑 `/etc/mihomo/config.yaml` 的 `HOME` 节点（server/port/username/password），`sudo systemctl restart mihomo`。验证出口：`curl -sS --proxy http://127.0.0.1:7899 https://api.ipify.org`（应为住宅 IP）。
- **住宅代理按流量计费**：只有国外采集走它，注意用量；别把 mode 改成全局把所有流量灌进去。
- **内存**：单次采集 Chromium 约 835MB，`--parallel 1` 从容（swap 几乎不动），勿高并发。
- 改了 `procurement-agent` 仓库脚本（三处环境变量回退 + 国内跳过），记得在本机 `git commit`。
