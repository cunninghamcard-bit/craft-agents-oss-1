import { BrowserWindow, shell, nativeTheme } from 'electron'
import { readFile } from 'fs/promises'
import { windowLog } from './logger'
import { join } from 'path'
import { IPC_CHANNELS, type FilePreviewData } from '../shared/types'
import { getBackgroundColor } from '@config/theme'

// Vite dev server URL for hot reload
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

interface FilePreviewWindowData {
  window: BrowserWindow
  sessionId: string
  previewId: string
  data: FilePreviewData
}

/**
 * Get window title based on preview mode
 */
function getWindowTitle(data: FilePreviewData): string {
  switch (data.mode) {
    case 'view': {
      const modeLabel = data.view.toolType === 'read' ? 'Read' : 'Write'
      return `${modeLabel}: ${data.view.filePath}`
    }
    case 'diff':
      return `Diff: ${data.diff.filePath}`
    case 'multi-diff': {
      const count = data.multiDiff.changes.length
      return `Changes (${count} file${count !== 1 ? 's' : ''})`
    }
  }
}

/**
 * Get window dimensions based on preview mode
 */
function getWindowDimensions(data: FilePreviewData): { width: number; height: number; minWidth: number; minHeight: number } {
  switch (data.mode) {
    case 'view':
      return { width: 900, height: 700, minWidth: 600, minHeight: 400 }
    case 'diff':
      return { width: 1100, height: 800, minWidth: 800, minHeight: 500 }
    case 'multi-diff':
      return { width: 1200, height: 800, minWidth: 900, minHeight: 600 }
  }
}

/**
 * FilePreviewWindowManager - Unified manager for file preview windows
 *
 * Handles:
 * - 'view' mode: Read/Write tool results (syntax highlighted code)
 * - 'diff' mode: Single Edit tool result (diff view)
 * - 'multi-diff' mode: Multiple edits/writes with file sidebar
 */
export class FilePreviewWindowManager {
  private windows: Map<string, FilePreviewWindowData> = new Map()

  /**
   * Generate key for a preview window
   */
  private getKey(sessionId: string, previewId: string): string {
    return `${sessionId}:${previewId}`
  }

  /**
   * Open or focus an existing file preview window
   */
  openFilePreview(data: FilePreviewData): BrowserWindow {
    const { sessionId, previewId } = data
    const key = this.getKey(sessionId, previewId)

    // If window exists and is not destroyed, focus it
    const existing = this.windows.get(key)
    if (existing && !existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) {
        existing.window.restore()
      }
      existing.window.focus()
      // Update data if changed
      existing.data = data
      return existing.window
    }

    // Get window configuration based on mode
    const backgroundColor = getBackgroundColor(nativeTheme.shouldUseDarkColors)
    const title = getWindowTitle(data)
    const dimensions = getWindowDimensions(data)

    const window = new BrowserWindow({
      ...dimensions,
      title,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 18, y: 18 },
      backgroundColor,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Open external links in default browser
    window.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    // Store window data BEFORE loading URL
    this.windows.set(key, {
      window,
      sessionId,
      previewId,
      data,
    })

    // Load the file preview renderer
    const query = { sessionId, previewId }

    if (VITE_DEV_SERVER_URL) {
      const params = new URLSearchParams(query).toString()
      window.loadURL(`${VITE_DEV_SERVER_URL}/file-preview.html?${params}`)
    } else {
      window.loadFile(join(__dirname, 'renderer/file-preview.html'), { query })
    }

    // Listen for system theme changes
    const themeHandler = () => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.SYSTEM_THEME_CHANGED, nativeTheme.shouldUseDarkColors)
      }
    }
    nativeTheme.on('updated', themeHandler)

    // Clean up when window is closed
    window.on('closed', () => {
      nativeTheme.removeListener('updated', themeHandler)
      this.windows.delete(key)
      windowLog.info(`[FilePreviewWindowManager] File preview window closed for ${key}`)
    })

    windowLog.info(`[FilePreviewWindowManager] Created file preview window for ${key} (mode: ${data.mode})`)
    return window
  }

  /**
   * Get data for a file preview window (called from renderer on mount)
   */
  getData(sessionId: string, previewId: string): FilePreviewData | null {
    const key = this.getKey(sessionId, previewId)
    const windowData = this.windows.get(key)
    return windowData?.data ?? null
  }

  /**
   * Read a file's content (for "full file" view in multi-diff mode)
   */
  async readFileForPreview(filePath: string): Promise<string | null> {
    try {
      const content = await readFile(filePath, 'utf-8')
      return content
    } catch (err) {
      windowLog.warn(`[FilePreviewWindowManager] Failed to read file ${filePath}:`, err)
      return null
    }
  }

  /**
   * Close all preview windows for a session
   */
  closeWindowsForSession(sessionId: string): void {
    for (const [key, data] of this.windows) {
      if (data.sessionId === sessionId && !data.window.isDestroyed()) {
        data.window.close()
      }
    }
  }

  /**
   * Get all file preview windows
   */
  getAllWindows(): FilePreviewWindowData[] {
    return Array.from(this.windows.values()).filter((d) => !d.window.isDestroyed())
  }
}
