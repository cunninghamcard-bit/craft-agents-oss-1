# Feature TODO（未来要做）

记录已立项、待未来完成的大方向。每条含当前已探明的发现和卡点，做的时候少走弯路。

---

## 1. 权限控制 / 多用户路由设计

**目标**：一套连贯的「身份 + 权限 + workspace 路由」模型，支撑多用户和自动化场景。

**现状与卡点（已探明）**：
- 已有「多用户隔离」：飞书用户按 `open_id` 路由到各自 workspace（`~/.craft-agent/user-workspaces/<openid>`），会话/数据互不可见。
- 但 **lark 身份是共享的**：服务器上 lark-cli 用的是陈昊楠的 user token，所有飞书读写（查供应商/库存、写表）都以他名义 —— **飞书侧身份未隔离**。
- **Base 权限不均**：陈昊楠对业务 Base《供应商管理》**只读**（写/管工作流报 `91403`），对自己新建的 Base（如 AI 采购数据 `FrzDbGwmVa0YkAsd7g6c5pDHnlg`）可读写。AI 写入表就是因此放进了独立可写 Base。
- **自动化触发的 session 进哪个 workspace** 未定 —— 这是接入飞书事件（#2）的前置卡点。

**要决策的**：自动化/系统触发的会话归属、飞书操作身份如何按用户隔离、Base 读写权限怎么统一拿到。

---

## 2. 接入飞书事件的设计（飞书 Base 事件 → 应用）

**目标**：飞书多维表格（Base）记录变更等事件，能触发应用做事（建 session / 续会话 / 跑 skill，由配置决定 —— **不强求每事件新建 session**，那只是比喻）。

**现状与发现（已探明）**：
- **骨架已在**：应用有完整 automation 系统（事件总线 + 匹配器 + `executePromptAutomation` 建 session 跑 prompt，见 `SessionManager.ts:7008`）。接飞书事件是**加性的**，不破坏现有结构。
- **连接机制选了「Base 自动化 → 发消息给 bot」（option 2，零代码方向）**：在飞书 Base 自动化里配「记录变更 → 发消息给机器人（带字段数据）」，复用现有上游 IM→应用链路。几乎不用写代码，飞书侧配置为主。
  - 备选 option 1：fork 本地新增 webhook 接收端点 → `executePromptAutomation`。结构化 payload、不依赖聊天身份、控制更细；但要写一套 webhook + 开公网路径。当前不值得，除非 option 2 行不通。
- **lark adapter 是上游代码**（`messaging-gateway`，craft-ai-agents 维护；我们 fork 只改过它 3 行）。**别深改它**去加 bitable 事件，否则跟上游分叉 —— 自定义触发应做成 fork 本地隔离组件。
- **lark-cli 能纯命令行建 Base 自动化**：`lark-cli base +workflow-create/-update/-enable/-get/-list`。但两个前提：①**权限** —— 建/管工作流要对该 Base 有编辑/管理权（陈昊楠对自己的 Base 可以，对只读业务 Base 是 91403）；②**动作集未验** —— 飞书工作流 OpenAPI 到底支不支持「发飞书消息给机器人 / 发 HTTP 请求」这类动作没确认（UI 能配的 API 不一定开放）。**验法**：在自有 Base 的 UI 建一条样板 → `workflow-get` 抓 step JSON 学结构；或用 `workflow-create` 试错反推。
- **阻塞**：依赖 #1 的 workspace 路由 —— 自动化消息落哪个空间没定前，先用现有流默认行为，不在这步纠结。

---

## 3. 自动化的设计

**目标**：把「事件 → 配置化动作」做扎实，让飞书事件（#2）和其它来源都能驱动 agent。

**现状（已探明）**：
- automation 系统已是通用事件框架：`AppEvent`（标签变更、`SchedulerTick`、状态变更…）+ `AgentEvent`（PreToolUse 等）→ 事件总线 → 匹配器（regex + 条件）→ `onPromptsReady` → `executePromptAutomation` 建 session。
- 配置在 `{workspace}/.craft/automations.json`（matcher + prompt/label/model 等动作）。
- 接飞书事件 = 加一类新 `AppEvent`（如 `BitableRecordChanged`）+ 把外部事件 emit 进总线即可，框架本身不用大改。

**要做的**：补外部事件源接入、把触发动作的配置体验理顺（哪个事件 → 哪个 prompt/skill/workspace）、和 #1 的路由模型对齐。

---

> 三条相互关联：#2（飞书事件）落地依赖 #1（路由）拍板，都跑在 #3（自动化框架）上。建议顺序：先 #1 定方向 → #3 把框架补到能接外部事件 → #2 接上飞书。
