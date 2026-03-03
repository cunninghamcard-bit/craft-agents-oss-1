import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('startup migration (integration)', () => {
  it('repairs broken pi-api-key openai-codex provider on startup migration', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'craft-agent-config-'))
    const workspaceRoot = join(configDir, 'workspaces', 'my-workspace')
    mkdirSync(workspaceRoot, { recursive: true })

    // Make workspace appear valid to loadStoredConfig() so migration can run.
    writeFileSync(
      join(workspaceRoot, 'config.json'),
      JSON.stringify(
        {
          id: 'ws-config-1',
          name: 'My Workspace',
          slug: 'my-workspace',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        null,
        2,
      ),
      'utf-8',
    )

    const configPath = join(configDir, 'config.json')
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          workspaces: [
            {
              id: 'ws-1',
              name: 'My Workspace',
              rootPath: workspaceRoot,
              createdAt: Date.now(),
            },
          ],
          activeWorkspaceId: 'ws-1',
          activeSessionId: null,
          defaultLlmConnection: 'pi-api-key',
          llmConnections: [
            {
              slug: 'pi-api-key',
              name: 'Craft Agents Backend (OpenAI)',
              providerType: 'pi',
              authType: 'api_key',
              piAuthProvider: 'openai-codex',
              createdAt: Date.now(),
              models: [],
              defaultModel: '',
            },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    )

    const storageModulePath = '/Users/balintorosz/Documents/GitHub/craft-agents/packages/shared/src/config/storage.ts'
    const run = Bun.spawnSync([
      process.execPath,
      '--eval',
      `import { migrateLegacyLlmConnectionsConfig } from '${storageModulePath}'; migrateLegacyLlmConnectionsConfig();`,
    ], {
      env: {
        ...process.env,
        CRAFT_CONFIG_DIR: configDir,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })

    if (run.exitCode !== 0) {
      throw new Error(
        `migration subprocess failed (exit ${run.exitCode})\nstdout:\n${run.stdout.toString()}\nstderr:\n${run.stderr.toString()}`,
      )
    }

    const migrated = JSON.parse(readFileSync(configPath, 'utf-8'))
    const connection = migrated.llmConnections.find((c: any) => c.slug === 'pi-api-key')

    expect(connection).toBeDefined()
    expect(connection.piAuthProvider).toBe('openai')
    expect(connection.authType).toBe('api_key')
  })
})
