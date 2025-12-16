import * as React from "react"
import {
  Archive,
  Inbox,
  Plus,
  Search,
  Settings,
  Bot,
  ChevronRight,
  FolderOpen,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Separator } from "@/components/ui/separator"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import { ChatDisplay } from "./ChatDisplay"
import { SessionList } from "./SessionList"
import { Nav } from "./Nav"
import { useSession } from "@/hooks/useSession"
import type { Session, Workspace, SubAgentMetadata } from "../../../shared/types"

type ViewMode = 'inbox' | 'archive' | 'agent'

interface MailProps {
  workspaces: Workspace[]
  sessions: Session[]
  agents: SubAgentMetadata[]
  activeWorkspaceId: string | null
  defaultLayout?: number[]
  defaultCollapsed?: boolean
  navCollapsedSize?: number
  onSelectWorkspace: (id: string) => void
  onCreateSession: (workspaceId: string, agentId?: string) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onUnarchiveSession: (sessionId: string) => void
  onSendMessage: (sessionId: string, message: string) => void
  onOpenFile: (path: string) => void
  onOpenUrl: (url: string) => void
  onOpenSettings: () => void
  onRefreshAgents: () => void
}

// Group agents by folder path
interface AgentFolder {
  name: string
  path: string[]
  agents: SubAgentMetadata[]
  subfolders: AgentFolder[]
}

function groupAgentsByFolder(agents: SubAgentMetadata[]): AgentFolder {
  const root: AgentFolder = { name: '', path: [], agents: [], subfolders: [] }

  for (const agent of agents) {
    const folderPath = agent.folderPath || []
    let current = root

    for (const folderName of folderPath) {
      let subfolder = current.subfolders.find(f => f.name === folderName)
      if (!subfolder) {
        subfolder = {
          name: folderName,
          path: [...current.path, folderName],
          agents: [],
          subfolders: []
        }
        current.subfolders.push(subfolder)
      }
      current = subfolder
    }

    current.agents.push(agent)
  }

  return root
}

interface AgentTreeProps {
  folder: AgentFolder
  level: number
  isCollapsed: boolean
  selectedAgentId: string | null
  onSelectAgent: (agentId: string, agentName: string) => void
  getConversationCount: (agentId: string) => number
}

function AgentTree({ folder, level, isCollapsed, selectedAgentId, onSelectAgent, getConversationCount }: AgentTreeProps) {
  const [isOpen, setIsOpen] = React.useState(true)

  if (isCollapsed && level > 0) return null

  return (
    <div className={cn(level > 0 && "ml-3")}>
      {folder.name && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 w-full py-1 px-2 hover:bg-accent rounded-md text-sm">
            <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{folder.name}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {folder.agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id, agent.name)}
                className={cn(
                  "flex items-center gap-2 w-full py-1.5 px-2 ml-4 hover:bg-accent rounded-md text-sm",
                  selectedAgentId === agent.id && "bg-accent"
                )}
              >
                <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{agent.name.split('/').pop()}</span>
                <span className="ml-auto text-xs text-muted-foreground">{getConversationCount(agent.id)}</span>
              </button>
            ))}
            {folder.subfolders.map(subfolder => (
              <AgentTree
                key={subfolder.path.join('/')}
                folder={subfolder}
                level={level + 1}
                isCollapsed={isCollapsed}
                selectedAgentId={selectedAgentId}
                onSelectAgent={onSelectAgent}
                getConversationCount={getConversationCount}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {!folder.name && (
        <>
          {folder.agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id, agent.name)}
              className={cn(
                "flex items-center gap-2 w-full py-1.5 px-2 hover:bg-accent rounded-md text-sm",
                selectedAgentId === agent.id && "bg-accent"
              )}
            >
              <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{agent.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">{getConversationCount(agent.id)}</span>
            </button>
          ))}
          {folder.subfolders.map(subfolder => (
            <AgentTree
              key={subfolder.path.join('/')}
              folder={subfolder}
              level={level + 1}
              isCollapsed={isCollapsed}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              getConversationCount={getConversationCount}
            />
          ))}
        </>
      )}
    </div>
  )
}

export function Mail({
  workspaces,
  sessions,
  agents,
  activeWorkspaceId,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize = 4,
  onSelectWorkspace,
  onCreateSession,
  onDeleteSession,
  onArchiveSession,
  onUnarchiveSession,
  onSendMessage,
  onOpenFile,
  onOpenUrl,
  onOpenSettings,
  onRefreshAgents,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed)
  const [session, setSession] = useSession()
  const [searchQuery, setSearchQuery] = React.useState("")
  const [viewMode, setViewMode] = React.useState<ViewMode>('inbox')
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null)

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  // Count sessions by archive status
  const inboxCount = sessions.filter(s => !s.isArchived).length
  const archiveCount = sessions.filter(s => s.isArchived).length

  // Get conversation count per agent
  const getConversationCount = React.useCallback((agentId: string) => {
    return sessions.filter(s => s.agentId === agentId && !s.isArchived).length
  }, [sessions])

  // Filter sessions based on view mode, agent selection, and search
  const filteredSessions = React.useMemo(() => {
    let filtered = sessions

    // Filter by view mode
    if (viewMode === 'inbox') {
      filtered = filtered.filter(s => !s.isArchived)
    } else if (viewMode === 'archive') {
      filtered = filtered.filter(s => s.isArchived)
    } else if (viewMode === 'agent' && selectedAgentId) {
      filtered = filtered.filter(s => s.agentId === selectedAgentId && !s.isArchived)
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(s => {
        const workspaceName = s.workspaceName?.toLowerCase() || ''
        const lastMessage = s.messages[s.messages.length - 1]?.content?.toLowerCase() || ''
        const agentName = s.agentName?.toLowerCase() || ''
        return workspaceName.includes(query) || lastMessage.includes(query) || agentName.includes(query)
      })
    }

    return filtered
  }, [sessions, viewMode, selectedAgentId, searchQuery])

  const selectedSession = sessions.find(s => s.id === session.selected) || null

  // Group agents for tree view
  const agentTree = React.useMemo(() => groupAgentsByFolder(agents), [agents])

  const handleSelectAgent = (agentId: string, _agentName: string) => {
    setSelectedAgentId(agentId)
    setViewMode('agent')
  }

  const handleInboxClick = () => {
    setViewMode('inbox')
    setSelectedAgentId(null)
    setSession({ selected: null })
  }

  const handleArchiveClick = () => {
    setViewMode('archive')
    setSelectedAgentId(null)
    setSession({ selected: null })
  }

  // Get title based on view mode
  const listTitle = viewMode === 'archive' ? 'Archive' :
                    viewMode === 'agent' && selectedAgentId ?
                      agents.find(a => a.id === selectedAgentId)?.name || 'Conversations' :
                      'Conversations'

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          localStorage.setItem('mail-layout', JSON.stringify(sizes))
        }}
        className="h-full items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={10}
          maxSize={20}
          onCollapse={() => {
            setIsCollapsed(true)
            localStorage.setItem('mail-collapsed', JSON.stringify(true))
          }}
          onResize={() => {
            setIsCollapsed(false)
            localStorage.setItem('mail-collapsed', JSON.stringify(false))
          }}
          className={cn(
            "bg-sidebar overflow-hidden min-w-0",
            isCollapsed &&
              "!min-w-12.5 transition-all duration-300 ease-in-out"
          )}
        >
          <div className="flex h-full flex-col">
            {/* Top section */}
            <div className="flex-1 flex flex-col min-h-0">
              <div
                className={cn(
                  "flex h-13 items-center justify-center shrink-0",
                  isCollapsed ? "h-13" : "px-2"
                )}
              >
                <WorkspaceSwitcher
                  isCollapsed={isCollapsed}
                  workspaces={workspaces}
                  activeWorkspaceId={activeWorkspaceId}
                  onSelect={onSelectWorkspace}
                />
              </div>
              <Separator />
              <Nav
                isCollapsed={isCollapsed}
                links={[
                  {
                    title: "Inbox",
                    label: String(inboxCount),
                    icon: Inbox,
                    variant: viewMode === 'inbox' ? "default" : "ghost",
                    onClick: handleInboxClick,
                  },
                  {
                    title: "Archive",
                    label: String(archiveCount),
                    icon: Archive,
                    variant: viewMode === 'archive' ? "default" : "ghost",
                    onClick: handleArchiveClick,
                  },
                  {
                    title: "New Chat",
                    label: "",
                    icon: Plus,
                    variant: "ghost",
                    onClick: () => activeWorkspace && onCreateSession(activeWorkspace.id, selectedAgentId || undefined),
                  },
                ]}
              />
              <Separator />
              {/* Agent list */}
              {!isCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Agents</span>
                    <button
                      onClick={onRefreshAgents}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Refresh
                    </button>
                  </div>
                  <ScrollArea className="h-[calc(100%-2.5rem)]">
                    <div className="px-2 pb-2">
                      {agents.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-4">
                          No agents found. Create an "Agents" folder in your Craft space.
                        </p>
                      ) : (
                        <AgentTree
                          folder={agentTree}
                          level={0}
                          isCollapsed={isCollapsed}
                          selectedAgentId={selectedAgentId}
                          onSelectAgent={handleSelectAgent}
                          getConversationCount={getConversationCount}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
              {isCollapsed && (
                <Nav
                  isCollapsed={isCollapsed}
                  links={[
                    {
                      title: "Agents",
                      label: String(agents.length),
                      icon: Bot,
                      variant: viewMode === 'agent' ? "default" : "ghost",
                    },
                  ]}
                />
              )}
            </div>

            {/* Bottom section - Settings */}
            <div className="mt-auto shrink-0">
              <Separator />
              <Nav
                isCollapsed={isCollapsed}
                links={[
                  {
                    title: "Settings",
                    label: "",
                    icon: Settings,
                    variant: "ghost",
                    onClick: onOpenSettings,
                  },
                ]}
              />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={15} className="overflow-hidden min-w-0">
          <Tabs defaultValue="all" className="h-full flex flex-col min-w-0">
            <div className="flex items-center px-4 py-2 min-w-0">
              <h1 className="text-xl font-bold truncate">{listTitle}</h1>
              <TabsList className="ml-auto shrink-0">
                <TabsTrigger
                  value="all"
                  className="text-muted-foreground"
                >
                  All
                </TabsTrigger>
                <TabsTrigger
                  value="recent"
                  className="text-muted-foreground"
                >
                  Recent
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 p-4 backdrop-blur supports-backdrop-filter:bg-background/60 min-w-0">
              <form>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search"
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </form>
            </div>
            <TabsContent value="all" className="m-0">
              <SessionList
                items={filteredSessions}
                onDelete={onDeleteSession}
                onArchive={viewMode !== 'archive' ? onArchiveSession : undefined}
                onUnarchive={viewMode === 'archive' ? onUnarchiveSession : undefined}
              />
            </TabsContent>
            <TabsContent value="recent" className="m-0">
              <SessionList
                items={filteredSessions.slice(0, 10)}
                onDelete={onDeleteSession}
                onArchive={viewMode !== 'archive' ? onArchiveSession : undefined}
                onUnarchive={viewMode === 'archive' ? onUnarchiveSession : undefined}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30} className="overflow-hidden min-w-0">
          <ChatDisplay
            session={selectedSession}
            onSendMessage={(message) => selectedSession && onSendMessage(selectedSession.id, message)}
            onOpenFile={onOpenFile}
            onOpenUrl={onOpenUrl}
            onDelete={() => selectedSession && onDeleteSession(selectedSession.id)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  )
}
