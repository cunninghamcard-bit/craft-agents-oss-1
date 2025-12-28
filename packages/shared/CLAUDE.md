# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this package.

**Important:** Keep this file and the root `CLAUDE.md` up-to-date whenever functionality changes.

## Overview

`@craft-agent/shared` is the core business logic package for Craft Agent. It contains:
- Agent implementation (CraftAgent, SubmitPlan tool)
- Authentication (OAuth, credentials)
- Configuration (storage, preferences)
- MCP client and validation
- Headless execution mode
- Subagent system

## Package Exports

This package uses subpath exports for clean imports:

```typescript
import { CraftAgent } from '@craft-agent/shared/agent';
import { loadStoredConfig, type Workspace } from '@craft-agent/shared/config';
import { getCredentialManager } from '@craft-agent/shared/credentials';
import { SubAgentManager } from '@craft-agent/shared/agents';
import { CraftMcpClient } from '@craft-agent/shared/mcp';
import { loadWorkspaceSources, type LoadedSource } from '@craft-agent/shared/sources';
import { debug } from '@craft-agent/shared/utils';
```

## Directory Structure

```
src/
├── agent/              # CraftAgent, SubmitPlan tool, errors
├── agents/             # Agent management, extraction, cache
├── auth/               # OAuth, balance, craft-token, state
├── clients/            # External API clients (Craft API)
├── config/             # Storage, preferences, models
├── credentials/        # Secure credential storage (AES-256-GCM)
├── headless/           # Non-interactive execution mode
├── mcp/                # MCP client and connection validation
├── prompts/            # System prompt generation
├── sources/            # Source types and storage (MCP, API, local)
├── subscription/       # Craft subscription checking
├── utils/              # Debug logging, file handling, summarization
├── validation/         # URL validation
├── version/            # Version management, install scripts
├── branding.ts         # Branding constants
└── cache-ttl-interceptor.ts  # Extended prompt cache TTL
```

## Key Concepts

### CraftAgent (`src/agent/craft-agent.ts`)
The main agent class that wraps the Claude Agent SDK. Handles:
- MCP server connections
- Tool permissions via PreToolUse hook
- Large result summarization via PostToolUse hook
- Safe mode integration
- Session continuity

### Credentials (`src/credentials/`)
All sensitive credentials (API keys, OAuth tokens) are stored in an AES-256-GCM encrypted file at `~/.craft-agent/credentials.enc`. The `CredentialManager` provides the API for reading and writing credentials.

### Configuration (`src/config/storage.ts`)
Multi-workspace configuration stored in `~/.craft-agent/config.json`. Supports multiple workspaces with separate MCP servers and sessions.

### Agents (`src/agents/`)
Agents are specialized configurations that extend the base agent with custom instructions, MCP servers, and REST APIs. Stored as folders at `~/.craft-agent/agents/{slug}/`.

### Sources (`src/sources/`)
Sources are external data connections (MCP servers, APIs, local filesystems). Stored at `~/.craft-agent/sources/{slug}/` with config.json and guide.md. Types: `mcp`, `api`, `local`.

## Dependencies

- `@craft-agent/core` - Shared types
- `@anthropic-ai/claude-agent-sdk` - Claude Agent SDK

## Type Checking

```bash
# From monorepo root
cd packages/shared && bun run tsc --noEmit
```
