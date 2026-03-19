import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface VCRedistCheckResult {
  installed: boolean
  /** Human-readable message suitable for logging or dialogs */
  message: string
}

/**
 * Well-known paths where vcruntime140.dll is installed by VC++ Redistributable.
 * Covers both x64 and ARM64 host scenarios (ARM64 Windows runs x86_64 via emulation,
 * so the x64 DLL in SysWOW64 or System32 is what matters for onnxruntime).
 */
const VCRUNTIME_DLL_PATHS = [
  join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'vcruntime140.dll'),
  join(process.env.SystemRoot ?? 'C:\\Windows', 'SysWOW64', 'vcruntime140.dll'),
]

/**
 * Check whether the Microsoft Visual C++ Redistributable is installed on Windows.
 *
 * This is required for onnxruntime (used by markitdown's magika file classifier)
 * to load its native DLLs. Without it, markitdown crashes with a DLL-not-found error
 * when converting PDF, PPTX, DOCX, and XLSX files.
 *
 * On non-Windows platforms, always returns { installed: true } since vcruntime
 * is not relevant (shared libs are managed by the system package manager).
 */
export function checkVCRedistInstalled(): VCRedistCheckResult {
  if (process.platform !== 'win32') {
    return { installed: true, message: 'Not applicable on this platform' }
  }

  for (const dllPath of VCRUNTIME_DLL_PATHS) {
    if (existsSync(dllPath)) {
      return { installed: true, message: `Found vcruntime140.dll at ${dllPath}` }
    }
  }

  return {
    installed: false,
    message:
      'Microsoft Visual C++ Redistributable is not installed. ' +
      'Document conversion tools (PDF, PPTX, DOCX, XLSX) will not work correctly. ' +
      'Please install it from: https://aka.ms/vs/17/release/vc_redist.x64.exe',
  }
}
