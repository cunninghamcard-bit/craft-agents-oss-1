import { BrowserWindow, shell, nativeTheme } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '../shared/types'

// Vite dev server URL for hot reload
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

interface PreviewWindowData {
  window: BrowserWindow
  sessionId: string
  messageId: string
  originalContent: string
}

/**
 * PreviewWindowManager - Manages pop-out preview windows for markdown messages
 *
 * Each preview is keyed by sessionId:messageId to support multiple previews.
 * Windows are independent of workspace windows.
 */
export class PreviewWindowManager {
  private windows: Map<string, PreviewWindowData> = new Map()

  /**
   * Generate key for a preview window
   */
  private getKey(sessionId: string, messageId: string): string {
    return `${sessionId}:${messageId}`
  }

  /**
   * Open or focus an existing preview window
   */
  openPreview(sessionId: string, messageId: string, content: string): BrowserWindow {
    const key = this.getKey(sessionId, messageId)

    // If window exists and is not destroyed, focus it
    const existing = this.windows.get(key)
    if (existing && !existing.window.isDestroyed()) {
      if (existing.window.isMinimized()) {
        existing.window.restore()
      }
      existing.window.focus()
      // Update content if changed
      existing.originalContent = content
      return existing.window
    }

    // Create new preview window (solid background, no vibrancy)
    // Match Monaco theme backgrounds: vs=#ffffff, vs-dark=#1e1e1e
    const backgroundColor = nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff'

    const window = new BrowserWindow({
      width: 900,
      height: 700,
      minWidth: 600,
      minHeight: 400,
      title: 'Preview',
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

    // Store window data BEFORE loading URL to avoid race condition
    // (renderer may call getPreviewContent before URL finishes loading)
    this.windows.set(key, {
      window,
      sessionId,
      messageId,
      originalContent: content,
    })

    // Load the preview renderer with session/message IDs
    const query = { sessionId, messageId }

    if (VITE_DEV_SERVER_URL) {
      const params = new URLSearchParams(query).toString()
      // Use preview.html instead of index.html
      window.loadURL(`${VITE_DEV_SERVER_URL}/preview.html?${params}`)
    } else {
      window.loadFile(join(__dirname, 'renderer/preview.html'), { query })
    }

    // Handle window close with unsaved changes warning
    window.on('close', (event) => {
      const data = this.windows.get(key)
      if (data) {
        // Note: hasUnsavedChanges tracking would need to be communicated from renderer
        // For now, we just close without warning - the renderer handles the confirm dialog
      }
    })

    // Clean up when window is closed
    window.on('closed', () => {
      this.windows.delete(key)
      console.log(`[PreviewWindowManager] Preview window closed for ${key}`)
    })

    // Listen for system theme changes
    const themeHandler = () => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.SYSTEM_THEME_CHANGED, nativeTheme.shouldUseDarkColors)
      }
    }
    nativeTheme.on('updated', themeHandler)

    // Clean up theme listener when window is destroyed
    window.on('closed', () => {
      nativeTheme.removeListener('updated', themeHandler)
    })

    console.log(`[PreviewWindowManager] Created preview window for ${key}`)
    return window
  }

  /**
   * Get content for a preview (called from renderer on mount)
   */
  getContent(sessionId: string, messageId: string): string {
    const key = this.getKey(sessionId, messageId)
    const data = this.windows.get(key)
    console.log(`[PreviewWindowManager] getContent for ${key}:`, {
      found: !!data,
      contentLength: data?.originalContent?.length ?? 0,
      windowsCount: this.windows.size,
    })
    return data?.originalContent ?? ''
  }

  /**
   * Update original content (when save is successful)
   */
  updateOriginalContent(sessionId: string, messageId: string, content: string): void {
    const key = this.getKey(sessionId, messageId)
    const data = this.windows.get(key)
    if (data) {
      data.originalContent = content
    }
  }

  /**
   * Broadcast content update to preview windows (when original message changes)
   */
  broadcastContentUpdate(sessionId: string, messageId: string, content: string): void {
    const key = this.getKey(sessionId, messageId)
    const data = this.windows.get(key)
    if (data && !data.window.isDestroyed()) {
      data.window.webContents.send(
        IPC_CHANNELS.PREVIEW_MESSAGE_UPDATED,
        sessionId,
        messageId,
        content
      )
    }
  }

  /**
   * Get all preview windows for a session (for cleanup when session is deleted)
   */
  getWindowsForSession(sessionId: string): PreviewWindowData[] {
    const result: PreviewWindowData[] = []
    for (const [key, data] of this.windows) {
      if (data.sessionId === sessionId && !data.window.isDestroyed()) {
        result.push(data)
      }
    }
    return result
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
   * Get all preview windows
   */
  getAllWindows(): PreviewWindowData[] {
    return Array.from(this.windows.values()).filter((d) => !d.window.isDestroyed())
  }
}
