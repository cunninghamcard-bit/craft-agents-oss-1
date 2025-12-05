import React, { useCallback, useState, useMemo } from 'react';
import { Box, useApp, useInput, Text } from 'ink';
import { Header, WelcomeBanner } from './components/Header.tsx';
import { Messages, type Message } from './components/Messages.tsx';
import { Input, InputHint } from './components/Input.tsx';
import { ModelSelector, type Model } from './components/ModelSelector.tsx';
import { WorkspaceSelector } from './components/WorkspaceSelector.tsx';
import { WorkspaceAdd } from './components/WorkspaceAdd.tsx';
import { WorkspaceRename } from './components/WorkspaceRename.tsx';
import { ApiKeyChange } from './components/ApiKeyChange.tsx';
import { AskUserQuestion } from './components/AskUserQuestion.tsx';
import { useAgent } from './hooks/useAgent.ts';
import { useHistory } from './hooks/useHistory.ts';
import { useResize } from './hooks/useResize.ts';
import { formatToolsHelp } from '../mcp/tools.ts';
import { getConfigPath, getWorkspaces, setActiveWorkspace, removeWorkspace, renameWorkspace, getWorkspaceDataPath, updateApiKey, getAuthType, type Workspace, type AuthType } from '../config/storage.ts';
import { formatPreferencesDisplay, getPreferencesPath } from '../config/preferences.ts';
import { formatTokens } from './utils/markdown.ts';
import { processInputWithFiles, readClipboard, type FileAttachment } from './utils/files.ts';
import type { CraftAgentConfig } from '../agent/craft-agent.ts';

export interface AppProps {
  config: CraftAgentConfig;
  onRequestSetup?: () => void;
}

const HELP_TEXT = `
**Craft Document Assistant** - Commands

**Chat**
  Just type your message and press Enter to chat with Claude.

**Commands**
  /help        Show this help message
  /clear       Clear conversation history
  /paste       Paste files/images from clipboard
  /tools       List available Craft MCP tools
  /config      Show current configuration
  /prefs       Show user preferences
  /setup       Reconfigure API keys and MCP settings
  /apikey      Change Anthropic API key
  /compact     Toggle compact/expanded tool output
  /cost        Show token usage and estimated cost
  /model       Show or change model (e.g., /model opus)
  /workspace   Switch workspace (e.g., /workspace work)
  /workspace add     Add a new Craft MCP workspace
  /workspace rename  Rename current workspace
  /workspace remove  Remove a workspace
  /web         Toggle web search capability
  /fetch       Toggle web fetch capability
  /bash        Toggle bash/shell execution
  /exit        Exit the application (or Ctrl+C)

**Keyboard Shortcuts**
  Enter      Send message
  ↑/↓        Navigate command history
  Backspace  Remove last attached file (when input is empty)
  Ctrl+C     Interrupt / Exit
  Ctrl+U     Clear input line
  Esc        Interrupt current operation

**Attaching Files**
  Drag & drop   Drag file into terminal window
  /paste        Paste from clipboard (Cmd+C a file first)
  Type path     Include /path/to/file in your message

**Ghostty Users**
  By default Ghostty uses Ctrl+Shift+V for paste.
  Add to ~/.config/ghostty/config:
    keybind = performable:ctrl+v=paste_from_clipboard

**Examples**
  "Show me today's daily note"
  "Search for meeting notes about project X"
  "What's the weather in NYC?" (uses web search)
  "Fetch and summarize https://example.com" (uses web fetch)
`.trim();

export const App: React.FC<AppProps> = ({ config, onRequestSetup }) => {
  const { exit } = useApp();

  // Handle terminal resize - clears screen to prevent artifacts
  const { columns } = useResize();

  const {
    messages,
    isProcessing,
    streamingText,
    status,
    processingStartTime,
    connected,
    tokenUsage,
    pendingPermission,
    pendingQuestion,
    hasExecutingTool,
    sendMessage,
    clearMessages,
    interrupt,
    respondToPermission,
    respondToQuestion,
    model,
    setModel,
    workspace,
    setWorkspace,
    isWebSearchEnabled,
    setWebSearchEnabled,
    isWebFetchEnabled,
    setWebFetchEnabled,
    isCodeExecutionEnabled,
    setCodeExecutionEnabled,
  } = useAgent(config);

  const { history, addToHistory } = useHistory();
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [compactMode, setCompactMode] = useState(true);
  const [showWelcome, setShowWelcome] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [showWorkspaceAdd, setShowWorkspaceAdd] = useState(false);
  const [showWorkspaceRename, setShowWorkspaceRename] = useState(false);
  const [showApiKeyChange, setShowApiKeyChange] = useState(false);
  const [pendingRemoveWorkspace, setPendingRemoveWorkspace] = useState<string | null>(null);

  // Models list
  const models: Model[] = [
    { id: 'claude-opus-4-5-20251101', name: 'Opus 4.5', desc: 'Most capable' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', desc: 'Balanced' },
    { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', desc: 'Fast & efficient' },
  ];

  const addLocalMessage = useCallback((content: string, type: Message['type'] = 'status') => {
    setLocalMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, type, content, timestamp: Date.now() },
    ]);
  }, []);

  const handleModelSelect = useCallback((modelId: string) => {
    setShowModelSelector(false);
    setModel(modelId);
  }, [setModel]);

  const handleModelCancel = useCallback(() => {
    setShowModelSelector(false);
  }, []);

  // Workspace handlers
  const handleWorkspaceSelect = useCallback((workspaceId: string) => {
    setShowWorkspaceSelector(false);
    const workspaces = getWorkspaces();
    const selectedWorkspace = workspaces.find(w => w.id === workspaceId);
    if (selectedWorkspace) {
      setActiveWorkspace(workspaceId);
      setWorkspace(selectedWorkspace);
    }
  }, [setWorkspace]);

  const handleWorkspaceCancel = useCallback(() => {
    setShowWorkspaceSelector(false);
  }, []);

  const handleWorkspaceAddOpen = useCallback(() => {
    setShowWorkspaceSelector(false);
    setShowWorkspaceAdd(true);
  }, []);

  const handleWorkspaceRenameOpen = useCallback((workspaceId: string) => {
    setShowWorkspaceSelector(false);
    // If renaming a different workspace, switch to it first
    if (workspaceId !== workspace.id) {
      const workspaces = getWorkspaces();
      const targetWorkspace = workspaces.find(w => w.id === workspaceId);
      if (targetWorkspace) {
        setActiveWorkspace(workspaceId);
        setWorkspace(targetWorkspace);
      }
    }
    setShowWorkspaceRename(true);
  }, [workspace.id, setWorkspace]);

  const handleWorkspaceAddComplete = useCallback((newWorkspace: Workspace) => {
    setShowWorkspaceAdd(false);
    setActiveWorkspace(newWorkspace.id);
    setWorkspace(newWorkspace);
  }, [setWorkspace]);

  const handleWorkspaceAddCancel = useCallback(() => {
    setShowWorkspaceAdd(false);
  }, []);

  const handleWorkspaceRenameSubmit = useCallback((newName: string) => {
    setShowWorkspaceRename(false);
    const success = renameWorkspace(workspace.id, newName);
    if (success) {
      // Update local workspace state with new name
      setWorkspace({ ...workspace, name: newName });
    }
  }, [workspace, setWorkspace]);

  const handleWorkspaceRenameCancel = useCallback(() => {
    setShowWorkspaceRename(false);
  }, []);

  const handleApiKeySubmit = useCallback((newApiKey: string) => {
    setShowApiKeyChange(false);
    const success = updateApiKey(newApiKey);
    if (success) {
      addLocalMessage('API key updated. Restart the app to use the new key.', 'system');
    } else {
      addLocalMessage('Failed to update API key.', 'error');
    }
  }, [addLocalMessage]);

  const handleApiKeyCancel = useCallback(() => {
    setShowApiKeyChange(false);
  }, []);

  const handlePaste = useCallback(() => {
    try {
      const clipboardItems = readClipboard();

      if (clipboardItems.length > 0) {
        setPendingAttachments(prev => [...prev, ...clipboardItems]);
      } else {
        addLocalMessage('No files or images in clipboard. Copy a file (Cmd+C) or take a screenshot first.', 'error');
      }
    } catch (err) {
      addLocalMessage(`Clipboard error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    }
  }, [addLocalMessage]);

  // Remove last attachment when backspace pressed with empty input
  const handleRemoveAttachment = useCallback(() => {
    setPendingAttachments(prev => {
      if (prev.length > 0) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  // Clear all attachments (Escape key)
  const handleClearAttachments = useCallback(() => {
    setPendingAttachments([]);
  }, []);

  // Handle pasted text (e.g., dragged file paths from terminal)
  const handlePastedText = useCallback((text: string) => {
    // Check if the pasted text contains file paths
    const { attachments, errors } = processInputWithFiles(text);

    if (attachments.length > 0) {
      setPendingAttachments(prev => [...prev, ...attachments]);
    }

    for (const error of errors) {
      addLocalMessage(error, 'error');
    }
  }, [addLocalMessage]);

  // Generate attachment label for display
  const attachmentLabel = useMemo(() => {
    if (pendingAttachments.length === 0) return '';
    if (pendingAttachments.length === 1) {
      const att = pendingAttachments[0];
      if (!att) return '1 file';
      const icon = att.type === 'image' ? '🖼' : att.type === 'pdf' ? '📄' : '📝';
      return `${icon} ${att.name}`;
    }
    const imageCount = pendingAttachments.filter(a => a.type === 'image').length;
    const fileCount = pendingAttachments.length - imageCount;
    const parts: string[] = [];
    if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
    if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
    return parts.join(', ');
  }, [pendingAttachments]);

  const handleSubmit = useCallback(
    async (input: string) => {
      // Handle slash commands
      if (input.startsWith('/')) {
        const parts = input.toLowerCase().trim().split(/\s+/);
        let command = parts[0] ?? '';

        // Primary commands for partial matching (order matters for priority)
        const primaryCommands = [
          '/help', '/clear', '/paste', '/tools', '/config', '/prefs',
          '/setup', '/apikey', '/compact', '/cost', '/model', '/workspace', '/web', '/fetch',
          '/bash', '/debug', '/exit'
        ];

        // If not an exact match, try partial matching
        const aliases = ['/?', '/q', '/quit', '/image', '/preferences', '/websearch', '/webfetch', '/w'];
        if (!primaryCommands.includes(command) && !aliases.includes(command)) {
          const matches = primaryCommands.filter(cmd => cmd.startsWith(command));
          if (matches.length === 1 && matches[0]) {
            command = matches[0];
          }
        }

        switch (command) {
          case '/exit':
          case '/quit':
          case '/q':
            exit();
            return;

          case '/clear':
            // Clear state first
            clearMessages();
            setLocalMessages([]);
            setPendingAttachments([]);
            setShowWelcome(true);
            // Clear screen and scrollback only - let Ink handle cursor
            process.stdout.write('\x1b[2J\x1b[3J');
            return;

          case '/paste':
          case '/image': {
            const clipboardItems = readClipboard();
            if (clipboardItems.length > 0) {
              setPendingAttachments(prev => [...prev, ...clipboardItems]);
            } else {
              addLocalMessage('No files or images in clipboard. Copy a file (Cmd+C) or take a screenshot first.', 'error');
            }
            return;
          }

          case '/help':
          case '/?':
            addLocalMessage(HELP_TEXT, 'assistant');
            return;

          case '/tools':
            addLocalMessage(formatToolsHelp(), 'assistant');
            return;

          case '/setup':
            if (onRequestSetup) {
              onRequestSetup();
            } else {
              addLocalMessage('Setup not available. Run with --setup flag to reconfigure.', 'status');
            }
            return;

          case '/apikey':
            setShowApiKeyChange(true);
            return;

          case '/config':
            const currentAuthType = getAuthType();
            addLocalMessage(
              `**Configuration**

- Config file: \`${getConfigPath()}\`
- Claude auth: ${currentAuthType === 'oauth_token' ? '**Max Subscription**' : 'API Key'}
- Workspace: \`${workspace.name}\`
- MCP URL: \`${workspace.mcpUrl}\`
- Model: \`${model}\`
- Compact mode: ${compactMode ? 'On' : 'Off'}
- Web search: ${isWebSearchEnabled() ? 'On' : 'Off'}
- Web fetch: ${isWebFetchEnabled() ? 'On' : 'Off'}
- Code execution: ${isCodeExecutionEnabled() ? 'On' : 'Off'}`,
              'assistant'
            );
            return;

          case '/prefs':
          case '/preferences':
            addLocalMessage(formatPreferencesDisplay(), 'assistant');
            return;

          case '/compact':
            setCompactMode(!compactMode);
            addLocalMessage(
              `Compact mode: ${!compactMode ? 'On' : 'Off'}`,
              'system'
            );
            return;

          case '/cost':
            const costDisplay = tokenUsage.costUsd < 0.01
              ? `$${(tokenUsage.costUsd * 100).toFixed(2)}¢`
              : `$${tokenUsage.costUsd.toFixed(4)}`;
            addLocalMessage(
              `**Token Usage (this session)**

- Input tokens: ${formatTokens(tokenUsage.inputTokens)}
- Output tokens: ${formatTokens(tokenUsage.outputTokens)}
- Total tokens: ${formatTokens(tokenUsage.totalTokens)}
- Cost: ${costDisplay}`,
              'assistant'
            );
            return;

          case '/model': {
            const modelArg = parts[1];

            if (modelArg) {
              // Parse number selection
              const num = parseInt(modelArg, 10);
              if (num >= 1 && num <= models.length) {
                const selected = models[num - 1];
                if (selected) {
                  setModel(selected.id);
                }
                return;
              }

              // Find matching model (partial match)
              const matchedModel = models.find(m =>
                m.id.toLowerCase().includes(modelArg.toLowerCase()) ||
                m.name.toLowerCase().includes(modelArg.toLowerCase())
              );

              if (matchedModel) {
                setModel(matchedModel.id);
              } else {
                addLocalMessage(`Unknown model: ${modelArg}`, 'error');
              }
            } else {
              // Show interactive selector
              setShowModelSelector(true);
            }
            return;
          }

          case '/w':
          case '/workspace': {
            const subCommand = parts[1];
            const workspaces = getWorkspaces();

            if (subCommand === 'add') {
              setShowWorkspaceAdd(true);
              return;
            }

            if (subCommand === 'rename') {
              setShowWorkspaceRename(true);
              return;
            }

            if (subCommand === 'remove') {
              const nameToRemove = parts.slice(2).join(' ');
              if (!nameToRemove) {
                addLocalMessage('Usage: /workspace remove <name>', 'error');
                return;
              }

              const workspaceToRemove = workspaces.find(w =>
                w.name.toLowerCase().includes(nameToRemove.toLowerCase())
              );

              if (!workspaceToRemove) {
                addLocalMessage(`Workspace not found: ${nameToRemove}`, 'error');
                return;
              }

              if (workspaces.length === 1) {
                addLocalMessage('Cannot remove the only workspace. Add another workspace first.', 'error');
                return;
              }

              // Check if removing active workspace
              const isActive = workspaceToRemove.id === workspace.id;
              const removed = removeWorkspace(workspaceToRemove.id);

              if (removed) {
                // If we removed the active workspace, switch to another
                if (isActive) {
                  const remainingWorkspaces = getWorkspaces();
                  if (remainingWorkspaces.length > 0 && remainingWorkspaces[0]) {
                    setActiveWorkspace(remainingWorkspaces[0].id);
                    setWorkspace(remainingWorkspaces[0]);
                  }
                }
              } else {
                addLocalMessage('Failed to remove workspace', 'error');
              }
              return;
            }

            if (subCommand) {
              // Parse number selection
              const num = parseInt(subCommand, 10);
              if (num >= 1 && num <= workspaces.length) {
                const selected = workspaces[num - 1];
                if (selected) {
                  setActiveWorkspace(selected.id);
                  setWorkspace(selected);
                }
                return;
              }

              // Find matching workspace (partial match)
              const matchedWorkspace = workspaces.find(w =>
                w.name.toLowerCase().includes(subCommand.toLowerCase())
              );

              if (matchedWorkspace) {
                setActiveWorkspace(matchedWorkspace.id);
                setWorkspace(matchedWorkspace);
              } else {
                addLocalMessage(`Unknown workspace: ${subCommand}`, 'error');
              }
            } else {
              // Show interactive selector
              setShowWorkspaceSelector(true);
            }
            return;
          }

          case '/web':
          case '/websearch': {
            const newState = !isWebSearchEnabled();
            setWebSearchEnabled(newState);
            addLocalMessage(
              `Web search: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          case '/fetch':
          case '/webfetch': {
            const newState = !isWebFetchEnabled();
            setWebFetchEnabled(newState);
            addLocalMessage(
              `Web fetch: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          case '/bash': {
            const newState = !isCodeExecutionEnabled();
            setCodeExecutionEnabled(newState);
            addLocalMessage(
              `Bash execution: ${newState ? 'Enabled' : 'Disabled'}`,
              'system'
            );
            return;
          }

          case '/debug': {
            const dataPath = getWorkspaceDataPath(workspace.id);
            const conversationPath = `${dataPath}/conversation.json`;
            addLocalMessage(
              `**Debug Info**\n\nWorkspace: ${workspace.name}\nConversation: file://${conversationPath}`,
              'assistant'
            );
            return;
          }

          default:
            addLocalMessage(`Unknown command: ${command}. Type /help for available commands.`, 'error');
            return;
        }
      }

      // Clear local messages when sending a real message
      setLocalMessages([]);

      // Process input for file attachments
      const { text, attachments: fileAttachments, errors } = processInputWithFiles(input);

      // Combine file attachments with pending clipboard attachments
      const allAttachments = [...pendingAttachments, ...fileAttachments];

      // Clear pending attachments
      setPendingAttachments([]);

      // Show any file processing errors
      for (const error of errors) {
        addLocalMessage(error, 'error');
      }

      // Regular message - add to history and send with attachments
      addToHistory(input);
      await sendMessage(text || input, allAttachments.length > 0 ? allAttachments : undefined);
    },
    [
      exit,
      clearMessages,
      sendMessage,
      addToHistory,
      addLocalMessage,
      onRequestSetup,
      config,
      compactMode,
      tokenUsage,
      showWelcome,
      model,
      setModel,
      workspace,
      setWorkspace,
      isWebSearchEnabled,
      setWebSearchEnabled,
      isWebFetchEnabled,
      setWebFetchEnabled,
      isCodeExecutionEnabled,
      setCodeExecutionEnabled,
      pendingAttachments,
    ]
  );

  // Handle Ctrl+C to interrupt or exit, and permission responses
  useInput((input, key) => {
    // Handle permission responses (y/n/a)
    if (pendingPermission) {
      if (input.toLowerCase() === 'y') {
        respondToPermission(true, false);  // Allow once
        return;
      } else if (input.toLowerCase() === 'n') {
        respondToPermission(false, false);  // Deny
        return;
      } else if (input.toLowerCase() === 'a') {
        respondToPermission(true, true);  // Always allow this command
        return;
      }
    }

    if (key.ctrl && input === 'c') {
      if (pendingPermission) {
        respondToPermission(false, false); // Deny on Ctrl+C
      } else if (isProcessing) {
        interrupt();
      } else {
        exit();
      }
    }

    // Handle Escape to interrupt or deny permission
    if (key.escape) {
      if (pendingPermission) {
        respondToPermission(false, false);
      } else if (isProcessing) {
        interrupt();
      }
    }
  });

  // Combine agent messages with local messages
  const allMessages = [...messages, ...localMessages];

  return (
    <Box flexDirection="column" width="100%" minHeight={20}>
      {/* Welcome banner */}
      {showWelcome && (
        <Box flexDirection="column" paddingX={1}>
          <WelcomeBanner />
          {allMessages.length === 0 && (
            <Box marginTop={1}>
              <Text dimColor>
                Type a message to get started, or /help for commands.
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Messages area */}
      <Box flexDirection="column" paddingX={1}>
        <Messages
          messages={allMessages}
          isProcessing={isProcessing}
          streamingText={streamingText}
          status={status}
          processingStartTime={processingStartTime}
          hasExecutingTool={hasExecutingTool}
          compact={compactMode}
        />
      </Box>

      {/* Model selector overlay */}
      {showModelSelector && (
        <ModelSelector
          models={models}
          currentModelId={model}
          onSelect={handleModelSelect}
          onCancel={handleModelCancel}
        />
      )}

      {/* Workspace selector overlay */}
      {showWorkspaceSelector && (
        <WorkspaceSelector
          workspaces={getWorkspaces()}
          currentWorkspaceId={workspace.id}
          onSelect={handleWorkspaceSelect}
          onCancel={handleWorkspaceCancel}
          onAdd={handleWorkspaceAddOpen}
          onRename={handleWorkspaceRenameOpen}
        />
      )}

      {/* Workspace add wizard */}
      {showWorkspaceAdd && (
        <WorkspaceAdd
          onComplete={handleWorkspaceAddComplete}
          onCancel={handleWorkspaceAddCancel}
        />
      )}

      {/* Workspace rename input */}
      {showWorkspaceRename && (
        <WorkspaceRename
          currentName={workspace.name}
          onSubmit={handleWorkspaceRenameSubmit}
          onCancel={handleWorkspaceRenameCancel}
        />
      )}

      {/* API key change input */}
      {showApiKeyChange && (
        <ApiKeyChange
          onSubmit={handleApiKeySubmit}
          onCancel={handleApiKeyCancel}
        />
      )}

      {/* Input + Status bar + Header together at bottom */}
      <Box flexDirection="column" width="100%" paddingX={1}>
        {/* Permission prompt */}
        {pendingPermission && (
          <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={1}>
            <Text color="yellow" bold>⚠ Permission Required</Text>
            <Text>Tool: <Text color="cyan">{pendingPermission.toolName}</Text></Text>
            <Text dimColor>Command: <Text color="white">{pendingPermission.command}</Text></Text>
            <Box marginTop={1}>
              <Text>Allow? </Text>
              <Text color="green" bold>[Y]es</Text>
              <Text> / </Text>
              <Text color="red" bold>[N]o</Text>
              <Text> / </Text>
              <Text color="blue" bold>[A]lways</Text>
              <Text dimColor> (for this command)</Text>
            </Box>
          </Box>
        )}
        {/* AskUserQuestion prompt */}
        {pendingQuestion && (
          <Box marginBottom={1}>
            <AskUserQuestion
              questions={pendingQuestion.questions}
              onSubmit={respondToQuestion}
            />
          </Box>
        )}
        {!showModelSelector && !showWorkspaceSelector && !showWorkspaceAdd && !showWorkspaceRename && !showApiKeyChange && !pendingPermission && !pendingQuestion && (
          <Input
            onSubmit={handleSubmit}
            onPaste={handlePaste}
            onRemoveAttachment={handleRemoveAttachment}
            onClearAttachments={handleClearAttachments}
            onPastedText={handlePastedText}
            disabled={isProcessing}
            history={history}
            attachmentCount={pendingAttachments.length}
            attachmentLabel={attachmentLabel}
            columns={columns}
          />
        )}
        <Header
          connected={connected}
          model={model}
          mcpUrl={workspace.mcpUrl}
          workspaceName={workspace.name}
          contextTokens={tokenUsage.contextTokens}
          costUsd={tokenUsage.costUsd}
          authType={getAuthType()}
        />
      </Box>
    </Box>
  );
};
