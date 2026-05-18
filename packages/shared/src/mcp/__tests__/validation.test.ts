import { describe, expect, it } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { validateStdioMcpConnection } from '../validation.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = (name: string) => join(HERE, 'fixtures', name)

describe('validateStdioMcpConnection', () => {
  it(
    'returns success and tool list for a spec-compliant stdio server',
    async () => {
      const result = await validateStdioMcpConnection({
        command: 'node',
        args: [FIXTURE('mcp-server-good.mjs')],
        timeout: 8000,
      })
      expect(result.success).toBe(true)
      expect(result.tools).toEqual(['echo'])
      expect(result.error).toBeUndefined()
    },
    15000,
  )

  it(
    'surfaces a framing hint when the server uses LSP-style Content-Length framing',
    async () => {
      const start = Date.now()
      const result = await validateStdioMcpConnection({
        command: 'node',
        args: [FIXTURE('mcp-server-lsp.mjs')],
        // Generous outer budget — the connect phase should fail well before this
        // either via timeout or via parse error → "Connection closed".
        timeout: 12000,
      })
      const elapsed = Date.now() - start
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      // Specific framing diagnostic surfaced for any connect-phase failure.
      expect(result.error!).toContain('newline-delimited JSON-RPC')
      // Stderr surfaces in the error message.
      expect(result.error!).toContain('LSP-style framing')
      // Failed before the outer 12s budget elapsed.
      expect(elapsed).toBeLessThan(11000)
    },
    20000,
  )

  it(
    'returns a clean "command not found" message for ENOENT',
    async () => {
      const result = await validateStdioMcpConnection({
        command: '/definitely/not/a/real/command-xyzzy',
        args: [],
        timeout: 3000,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error!).toContain('Command not found')
      expect(result.error!).toContain('command-xyzzy')
    },
    10000,
  )

  it(
    'surfaces stderr output when the server exits immediately',
    async () => {
      const result = await validateStdioMcpConnection({
        command: 'node',
        args: ['-e', "process.stderr.write('boom from test server\\n'); process.exit(1);"],
        timeout: 5000,
      })
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error!.toLowerCase()).toContain('boom from test server')
    },
    15000,
  )
})
