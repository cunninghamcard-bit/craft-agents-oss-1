#!/usr/bin/env bun
/**
 * List all tools available in the Claude Code preset.
 *
 * Usage:
 *   bun run scripts/list-tools/index.ts
 */

import { query } from '@anthropic-ai/claude-agent-sdk';

interface SDKSystemInitMessage {
  type: 'system';
  subtype: 'init';
  tools: string[];
  mcp_servers: { name: string; status: string }[];
  model: string;
  claude_code_version: string;
}

async function main() {
  console.log('\n🔧 Listing tools in Claude Code preset...\n');

  const q = query({
    prompt: 'Say "hello" and nothing else.',
    options: {
      model: 'claude-sonnet-4-20250514',
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
      },
      tools: { type: 'preset', preset: 'claude_code' },
      cwd: process.cwd(),
      maxTurns: 1,
    },
  });

  let tools: string[] = [];
  let version = '';

  for await (const message of q) {
    // Look for the init message that contains tools
    if (
      message.type === 'system' &&
      (message as SDKSystemInitMessage).subtype === 'init'
    ) {
      const initMsg = message as SDKSystemInitMessage;
      tools = initMsg.tools;
      version = initMsg.claude_code_version;
      break;
    }
  }

  if (tools.length === 0) {
    console.error('❌ No tools found in init message');
    process.exit(1);
  }

  console.log(`Claude Code version: ${version}`);
  console.log(`Total tools: ${tools.length}\n`);
  console.log('Tools:');
  console.log('─'.repeat(40));

  for (const tool of tools.sort()) {
    console.log(`  • ${tool}`);
  }

  console.log('─'.repeat(40));
  console.log(`\n✅ Found ${tools.length} tools\n`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
