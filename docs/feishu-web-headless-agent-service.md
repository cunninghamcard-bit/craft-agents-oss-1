# Feishu-first Web/Headless Agent Service

日期: 2026-06-01

## 目标

把 `craft-agents-oss` 从本地壳应用改造成可上线为网站、可作为飞书/Lark 企业应用打开的 agent service。

目标形态:

- 飞书/Lark 负责入口、身份和企业应用容器。
- `apps/webui` 负责主工作台。
- `packages/server` + `packages/server-core` 负责 HTTP/WebSocket、session、workspace、sources、permissions、automations 和工具执行。
- `packages/pi-agent-server` 保留 Pi runtime。
- `packages/messaging-gateway` 保留 messaging，重点保留 Feishu/Lark messaging。

这不是把旧本地应用包进网页，而是用 WebUI + headless server 作为主产品形态。

## 删除边界

已经按“不保兼容，快速收敛”处理:

- 删除 `apps/electron`。
- 删除本地壳构建、安装和平台打包脚本。
- 删除 browser pane、browser tool、browser-use 相关 runtime/UI/transport/domain/test。
- 删除内置浏览器工具在 agent tool list、permission prerequisite、system prompt、session lifecycle 中的注册。
- 删除 auto-update WebUI 入口和 RPC channel。
- 将运行资源迁到根目录 `resources/`。

明确不保留:

- native app packaging。
- 本地窗口、菜单、dock、安装包更新生命周期。
- built-in browser automation pane/tool。

## 保留边界

保留:

- Pi agent/runtime。
- sources / skills / permissions。
- automations。
- Feishu/Lark messaging。
- WebUI。
- headless service。
- server-hosted resources。

目录边界:

```text
apps/webui
packages/server
packages/server-core
packages/pi-agent-server
packages/session-mcp-server
packages/session-tools-core
packages/messaging-gateway
packages/shared
packages/ui
resources
```

## 当前架构

```text
Feishu/Lark enterprise app
  -> HTTPS Web URL
      -> apps/webui
          -> browser WebAgentAPI
              -> WebSocket RPC
                  -> packages/server
                      -> packages/server-core
                          -> SessionManager
                          -> Pi agent subprocess
                          -> sources / skills / permissions
                          -> automations
                          -> messaging-gateway
```

Feishu/Lark 只做入口和身份容器。核心业务状态由自己的 server 和 workspace 数据目录持有。

## Feishu/Lark 登录

新增服务端配置:

```text
CRAFT_FEISHU_AUTH_ENABLED=true
CRAFT_FEISHU_DOMAIN=feishu
CRAFT_FEISHU_APP_ID=cli_xxx
CRAFT_FEISHU_APP_SECRET=xxx
CRAFT_FEISHU_PASSWORD_FALLBACK=false
CRAFT_WEBUI_COOKIE_SECRET=xxx
```

新增 HTTP endpoint:

- `GET /api/auth/feishu/config`
- `POST /api/auth/feishu/session`

前端登录页优先走 Feishu/Lark:

- 读取 `/api/auth/feishu/config`。
- 加载 H5 SDK。
- 调用 `tt.requestAccess({ appID, scopeList: [] })` 获取 code。
- POST code 到 `/api/auth/feishu/session`。
- backend 换取 user token / user info 并签发自己的 HttpOnly session cookie。

本地/operator fallback 可通过 `CRAFT_FEISHU_PASSWORD_FALLBACK=true` 和 `CRAFT_SERVER_TOKEN` 保留。

## WebUI 改造

已完成:

- `apps/webui` 自持 renderer/shared/transport 源码。
- `window.electronAPI` 改为 `window.webAgentAPI`。
- `ElectronAPI` 类型改为 `WebAgentAPI`。
- `apps/webui` 不再从 `apps/electron` 引源码。
- WebUI typecheck/build 通过。

## Resources 改造

已完成:

- `resources/docs`
- `resources/permissions`
- `resources/themes`
- `resources/tool-icons`
- `resources/scripts`
- `resources/bin`

服务端通过 `CRAFT_BUNDLED_ASSETS_ROOT` 指向 bundle root，并从根 `resources/` 读取运行资产。

## 验收命令

```bash
bun run webui:typecheck
bun run webui:build
cd packages/shared && bun run tsc --noEmit
cd ../server-core && bun run tsc --noEmit
cd ../server && bun run tsc --noEmit
cd ../session-tools-core && bun run tsc --noEmit
bun run server:build:subprocess
```

## 启动方式

本地完整 WebUI:

```bash
bun run server:build:subprocess
bun run webui:build

CRAFT_SERVER_TOKEN=dev-token \
CRAFT_WEBUI_DIR=apps/webui/dist \
CRAFT_BUNDLED_ASSETS_ROOT=$PWD \
CRAFT_FEISHU_AUTH_ENABLED=false \
bun run server:start
```

飞书/Lark 部署时把 HTTPS 域名配置为企业应用网页入口。
