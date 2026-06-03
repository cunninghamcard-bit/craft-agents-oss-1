# 在 Fly.io 上部署(飞书企业应用)

面向**完全没部署过**的人。照着从上往下抄命令即可。一次跑通约 20~30 分钟。

跑服务的机器由 Fly 托管,你不用买 VPS、不用装 Docker、不用配证书。每月成本约 $5~10(2GB 常开实例)。

---

## 0. 你需要先有的东西

- 一张能付 Fly 的**信用卡**(Fly 注册要验证卡,小额预授权)。
- 你公司的**飞书自建应用** `App ID` 和 `App Secret`(在飞书开放平台后台拿)。
- 本机装好 `flyctl`(Fly 的命令行工具)。

装 flyctl:

```bash
# macOS / Linux
curl -L https://fly.io/install.sh | sh
# Windows (PowerShell)
# pwsh -Command "iwr https://fly.io/install.sh -useb | iex"
```

注册并登录:

```bash
fly auth signup   # 已有账号用 fly auth login
```

---

## 1. 起项目(不立刻部署)

在仓库根目录:

```bash
fly launch --no-deploy --copy-config --name 你的应用名
```

- `你的应用名` 必须**全局唯一**(比如 `acme-craft-agent`),它会变成你的网址 `https://你的应用名.fly.dev`。
- `--copy-config` 让它用仓库里现成的 `fly.toml`,别让它重新生成。
- 如果它问要不要建数据库/Redis,**全选 No**。

---

## 2. 建持久卷(数据的命根子)

```bash
fly volumes create craft_data --size 3 --region hkg
```

- 这个卷存所有配置、session、workspace 数据。**删了就全没了。**
- `--region hkg` 必须和 `fly.toml` 里的 `primary_region` 一致(都用香港)。

---

## 3. 配密钥

敏感信息用 `fly secrets`(不会进代码仓库):

```bash
fly secrets set \
  CRAFT_SERVER_TOKEN=$(openssl rand -hex 24) \
  CRAFT_FEISHU_APP_ID=cli_你的appid \
  CRAFT_FEISHU_APP_SECRET=你的appsecret
```

- `CRAFT_SERVER_TOKEN` 是服务端口令,这里自动生成一个强随机值。**记下来**——万一飞书登录配错了,你还能用它当密码从浏览器登进去排查。

---

## 4. 改一个必须改的地址

打开 `fly.toml`,把这一行的 `craft-agent` 换成你第 1 步的应用名:

```toml
CRAFT_WEBUI_WS_URL = "wss://你的应用名.fly.dev"
```

> 为什么必须改:Fly 在边缘做 HTTPS,容器里跑的是普通 ws,浏览器在 HTTPS 页面上只能连 wss。不改这行,网页能打开但连不上后端。

---

## 5. 部署

```bash
fly deploy
```

第一次会在 Fly 的云端构建镜像(用仓库里的 `Dockerfile.server`,不占你本地内存),几分钟。看到 `1 desired, 1 running` 就成了。

打开看看:

```bash
fly open          # 浏览器打开 https://你的应用名.fly.dev
fly logs          # 看日志(排查全靠它)
fly status        # 看实例活没活
```

---

## 6. 把网址接到飞书

去**飞书开放平台 → 你的应用 → 网页应用**,把首页地址填:

```
https://你的应用名.fly.dev
```

把同一个域名加进应用的**安全设置 / 可信域名**白名单。然后在飞书里打开这个应用,应该能直接用飞书身份登录进工作台。

---

## 日常维护(就这几条)

```bash
fly logs                       # 看日志,90% 排查靠它
fly status                     # 活没活
fly apps restart 你的应用名      # 重启
git pull && fly deploy         # 升级到新版本(数据在卷里,不受影响)
fly secrets list               # 看配了哪些密钥(不显示值)
fly scale memory 4096          # 不够用了加内存(MB)
```

**心智模型不变:实例是一次性的,卷是命根子。** `fly deploy` 重建实例,数据卷不动,所以升级不丢数据。

### 备份(唯一重要的主动维护)

```bash
# 拉一份卷的快照到本地(Fly 也会自动做每日快照,保留若干天)
fly ssh console -C "tar czf - -C /home/craftagents/.craft-agent ." > craft-backup-$(date +%F).tar.gz
```

---

## 踩坑速查

| 现象 | 多半是 | 怎么办 |
|---|---|---|
| 网页能开,但一直转圈/连不上 | `CRAFT_WEBUI_WS_URL` 没改对 | 改成 `wss://你的应用名.fly.dev`,重新 `fly deploy` |
| 飞书里打开报「不可信域名」 | 飞书后台没加白名单 | 把 `你的应用名.fly.dev` 加进应用可信域名 |
| 重启后数据没了 | 卷没建 / 没挂上 | `fly volumes list` 确认有 `craft_data`,且 `fly.toml` 里 `[mounts]` 没动 |
| 实例反复重启 | 内存不够(OOM) | `fly scale memory 4096` 加到 4GB |
| 登录飞书失败 | App ID/Secret 配错 | `fly secrets set` 重设;临时用 `CRAFT_SERVER_TOKEN` 当密码登进去排查 |
| 大陆访问慢 | Fly 海外机房固有延迟 | 用香港机房已是最优;要更快得换国内方案 |

---

## 想省钱?(可选)

把 `fly.toml` 改成用完自动休眠、没人用时缩到零:

```toml
[http_service]
  auto_stop_machines = "stop"
  min_machines_running = 0
```

代价:没人用时第一个请求要等几秒冷启动。内部工具一般无所谓。
