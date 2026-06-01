# @craft-agent/server-core

Reusable WS/headless server infrastructure extracted from `apps/web`.

## Scope

- WS RPC transport primitives (`server`, `codec`, `types`, `capabilities`)
- Runtime platform contracts (`PlatformServices`) and headless implementation
- Generic handler dependency contracts
- Reusable headless bootstrap orchestration

## Out of scope

- Web UI/main-process window management
- Renderer channel maps and generated client API wrappers
- Session/domain business logic (`SessionManager`, handlers)

Those remain in `apps/web` and are injected into bootstrap at runtime.
