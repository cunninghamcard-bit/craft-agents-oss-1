# Craft Agents

Craft Agents is now shaped as a Feishu-first web/headless agent service.

The product runs as a deployable web app backed by a headless server. Feishu/Lark is the entry, identity, and enterprise app container. The service owns the agent runtime, sessions, workspaces, sources, automations, permissions, and messaging integrations.

## Runtime Shape

```text
Feishu/Lark app
  -> HTTPS Web URL
      -> apps/webui
          -> WebSocket RPC
              -> packages/server
                  -> packages/server-core
                  -> packages/pi-agent-server
                  -> packages/session-mcp-server
                  -> packages/messaging-gateway
```

The retained product surface is:

- `apps/webui`: browser UI for sessions and settings.
- `packages/server` and `packages/server-core`: HTTP/WebSocket service, auth, session management, tool execution, source handling, and WebUI hosting.
- `packages/pi-agent-server`: Pi runtime subprocess.
- `packages/session-tools-core` and `packages/session-mcp-server`: session-scoped tools.
- `packages/messaging-gateway`: Telegram, WhatsApp, and Lark/Feishu messaging bridge, with Lark/Feishu kept as the primary enterprise messaging path.
- `resources/`: bundled docs, permissions, themes, tool icons, and script helpers used by the service.

## Quick Start

```bash
bun install
bun run server:build:subprocess
bun run webui:build

CRAFT_SERVER_TOKEN=dev-token \
CRAFT_WEBUI_DIR=apps/webui/dist \
CRAFT_BUNDLED_ASSETS_ROOT=$PWD \
CRAFT_FEISHU_AUTH_ENABLED=false \
bun run server:start
```

Open the printed HTTP URL. For local development, use the Vite dev server with the API/WS proxy:

```bash
# terminal 1
CRAFT_SERVER_TOKEN=dev-token \
CRAFT_BUNDLED_ASSETS_ROOT=$PWD \
bun run server:start

# terminal 2
bun run webui:dev
```

## Feishu/Lark App Login

For a Feishu or Lark embedded web app, configure the server with app credentials:

```bash
CRAFT_FEISHU_AUTH_ENABLED=true
CRAFT_FEISHU_DOMAIN=feishu
CRAFT_FEISHU_APP_ID=cli_xxx
CRAFT_FEISHU_APP_SECRET=xxx
CRAFT_WEBUI_COOKIE_SECRET=replace-with-a-long-random-secret
CRAFT_WEBUI_DIR=apps/webui/dist
CRAFT_BUNDLED_ASSETS_ROOT=/app
```

Relevant auth endpoints:

- `GET /api/auth/feishu/config`
- `POST /api/auth/feishu/session`
- `POST /api/auth`
- `POST /api/logout`

The Feishu/Lark flow mints the service's own signed session cookie. `CRAFT_SERVER_TOKEN` remains useful for local/operator fallback, but it is not the intended end-user login path inside Feishu/Lark.

## Deployment

The server can host the built WebUI and serve the WebSocket RPC endpoint from the same process:

```bash
bun run server:build:subprocess
bun run webui:build

CRAFT_RPC_HOST=0.0.0.0 \
CRAFT_RPC_PORT=9100 \
CRAFT_SERVER_TOKEN=replace-with-operator-token \
CRAFT_WEBUI_COOKIE_SECRET=replace-with-cookie-secret \
CRAFT_WEBUI_DIR=apps/webui/dist \
CRAFT_BUNDLED_ASSETS_ROOT=$PWD \
bun run server:start
```

Put this behind HTTPS before exposing it as a Feishu/Lark web app URL. The Feishu/Lark app should point to the public HTTPS origin for the WebUI.

## Validation

```bash
bun run webui:typecheck
bun run webui:build
cd packages/shared && bun run tsc --noEmit
cd ../server-core && bun run tsc --noEmit
cd ../server && bun run tsc --noEmit
cd ../session-tools-core && bun run tsc --noEmit
bun run server:build:subprocess
```

## Product Scope

In scope:

- Pi-backed agent sessions.
- Sources and source OAuth.
- Workspace permissions and default rules.
- Automations.
- Lark/Feishu messaging and session bindings.
- Web/headless deployment.

Out of scope for this product direction:

- Native app packaging.
- Local window/menu/update lifecycle.
- Built-in browser automation panes.
