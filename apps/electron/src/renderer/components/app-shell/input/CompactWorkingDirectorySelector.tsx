import * as React from 'react'
import { Check, X } from 'lucide-react'
import { Icon_Home, Icon_Folder } from '@craft-agent/ui'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'
import { getPathBasename, PATH_SEP } from '@/lib/platform'
import { useDirectoryPicker } from '@/hooks/useDirectoryPicker'
import { ServerDirectoryBrowser } from '@/components/ServerDirectoryBrowser'
import {
  getRecentWorkingDirs,
  addRecentWorkingDir,
  removeRecentWorkingDir,
} from './working-directory-history'

function formatPath(fullPath: string | undefined, homeDir: string): string {
  if (!fullPath) return PATH_SEP
  if (homeDir && fullPath.startsWith(homeDir)) {
    return '~' + fullPath.slice(homeDir.length)
  }
  return fullPath
}

interface CompactWorkingDirectorySelectorProps {
  workingDirectory?: string
  onWorkingDirectoryChange: (path: string) => void
  sessionFolderPath?: string
  workspaceId?: string
}

export function CompactWorkingDirectorySelector({
  workingDirectory,
  onWorkingDirectoryChange,
  sessionFolderPath,
  workspaceId,
}: CompactWorkingDirectorySelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [recentDirs, setRecentDirs] = React.useState<string[]>([])
  const [homeDir, setHomeDir] = React.useState<string>('')

  React.useEffect(() => {
    setRecentDirs(getRecentWorkingDirs(workspaceId))
    window.electronAPI?.getHomeDir?.().then((dir: string) => {
      if (dir) setHomeDir(dir)
    })
  }, [workspaceId])

  // Refresh recent dirs when drawer opens
  React.useEffect(() => {
    if (open) {
      setRecentDirs(getRecentWorkingDirs(workspaceId))
    }
  }, [open, workspaceId])

  const handleFolderSelected = React.useCallback((selectedPath: string) => {
    setRecentDirs(addRecentWorkingDir(selectedPath, workspaceId))
    onWorkingDirectoryChange(selectedPath)
  }, [onWorkingDirectoryChange, workspaceId])

  const {
    pickDirectory,
    showServerBrowser,
    serverBrowserMode,
    cancelServerBrowser,
    confirmServerBrowser,
  } = useDirectoryPicker(handleFolderSelected)

  const handleChooseFolder = () => {
    setOpen(false)
    pickDirectory()
  }

  const handleSelectRecent = (path: string) => {
    setRecentDirs(addRecentWorkingDir(path, workspaceId))
    onWorkingDirectoryChange(path)
    setOpen(false)
  }

  const handleReset = () => {
    if (sessionFolderPath) {
      onWorkingDirectoryChange(sessionFolderPath)
      setOpen(false)
    }
  }

  const handleRemoveRecent = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    setRecentDirs(removeRecentWorkingDir(path, workspaceId))
  }

  const hasFolder = !!workingDirectory && workingDirectory !== sessionFolderPath
  const folderName = hasFolder ? (getPathBasename(workingDirectory) || 'Folder') : undefined
  const showReset = hasFolder && sessionFolderPath && sessionFolderPath !== workingDirectory

  const filteredRecent = recentDirs
    .filter(p => p !== workingDirectory)
    .sort((a, b) => {
      const nameA = getPathBasename(a).toLowerCase()
      const nameB = getPathBasename(b).toLowerCase()
      return nameA.localeCompare(nameB)
    })

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            aria-label={hasFolder ? `Working directory: ${folderName}` : 'Working directory'}
            className="h-7 pl-2 pr-2.5 text-xs font-medium rounded-[6px] flex items-center gap-1.5 shadow-tinted outline-none select-none shrink-0 bg-foreground/5 text-foreground/60"
            style={{ '--shadow-color': 'var(--foreground-rgb)' } as React.CSSProperties}
          >
            <Icon_Home className="h-3.5 w-3.5" />
            {folderName && <span className="max-w-[80px] truncate">{folderName}</span>}
          </button>
        </DrawerTrigger>

        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Working Directory</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6 flex flex-col gap-1">
            {/* Current directory */}
            {hasFolder && (
              <div className="flex items-center gap-3 w-full px-3 py-3 rounded-lg bg-foreground/5">
                <Icon_Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{folderName}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatPath(workingDirectory, homeDir)}
                  </div>
                </div>
                <Check className="h-4 w-4 shrink-0 text-foreground/60" />
              </div>
            )}

            {/* Recent directories */}
            {filteredRecent.map((path) => {
              const name = getPathBasename(path) || 'Folder'
              return (
                <button
                  key={path}
                  type="button"
                  className="group/item flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left transition-colors hover:bg-foreground/5"
                  onClick={() => handleSelectRecent(path)}
                >
                  <Icon_Folder className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatPath(path, homeDir)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveRecent(e, path)}
                    className="shrink-0 h-5 w-5 rounded flex items-center justify-center opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </button>
              )
            })}

            {/* Actions */}
            <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
              <button
                type="button"
                className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left text-sm font-medium transition-colors hover:bg-foreground/5"
                onClick={handleChooseFolder}
              >
                Choose Folder...
              </button>
              {showReset && (
                <button
                  type="button"
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-left text-sm font-medium transition-colors hover:bg-foreground/5 text-muted-foreground"
                  onClick={handleReset}
                >
                  Reset to Session Root
                </button>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <ServerDirectoryBrowser
        open={showServerBrowser}
        mode={serverBrowserMode}
        onSelect={confirmServerBrowser}
        onCancel={cancelServerBrowser}
        initialPath={workingDirectory}
      />
    </>
  )
}
