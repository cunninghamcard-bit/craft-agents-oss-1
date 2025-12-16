import { formatDistanceToNow } from "date-fns"
import { Archive, ArchiveRestore, Trash2, Bot } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useSession } from "@/hooks/useSession"
import type { Session } from "../../../shared/types"

interface SessionListProps {
  items: Session[]
  onDelete: (sessionId: string) => void
  onArchive?: (sessionId: string) => void
  onUnarchive?: (sessionId: string) => void
}

export function SessionList({ items, onDelete, onArchive, onUnarchive }: SessionListProps) {
  const [session, setSession] = useSession()

  // Sort sessions by lastMessageAt descending
  const sortedItems = [...items].sort((a, b) =>
    (b.lastMessageAt || 0) - (a.lastMessageAt || 0)
  )

  return (
    <ScrollArea className="h-screen">
      <div className="flex flex-col gap-2 p-4 pt-0">
        {sortedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No conversations yet
          </p>
        ) : (
          sortedItems.map((item) => {
            const lastMessage = item.messages[item.messages.length - 1]
            const preview = lastMessage?.content?.slice(0, 300) || 'New conversation'

            return (
              <button
                key={item.id}
                className={cn(
                  "group flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:bg-accent relative",
                  session.selected === item.id && "bg-muted"
                )}
                onClick={() =>
                  setSession({
                    ...session,
                    selected: item.id,
                  })
                }
              >
                <div className="flex w-full flex-col gap-1">
                  <div className="flex items-center">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{item.workspaceName || 'Workspace'}</div>
                      {item.isProcessing && (
                        <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "ml-auto text-xs",
                        session.selected === item.id
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {item.lastMessageAt ? formatDistanceToNow(new Date(item.lastMessageAt), {
                        addSuffix: true,
                      }) : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span>{item.messages.length} message{item.messages.length !== 1 ? 's' : ''}</span>
                    {item.agentName && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        {item.agentName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {preview}
                </div>
                {item.isProcessing && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Processing</Badge>
                  </div>
                )}

                {/* Action buttons - shown on hover */}
                <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onArchive && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        onArchive(item.id)
                      }}
                      title="Archive"
                    >
                      <Archive className="size-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  )}
                  {onUnarchive && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        onUnarchive(item.id)
                      }}
                      title="Unarchive"
                    >
                      <ArchiveRestore className="size-3.5 text-muted-foreground hover:text-foreground" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(item.id)
                    }}
                    title="Delete"
                  >
                    <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </button>
            )
          })
        )}
      </div>
    </ScrollArea>
  )
}
