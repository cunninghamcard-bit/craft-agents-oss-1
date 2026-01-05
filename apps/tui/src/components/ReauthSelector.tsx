import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { extractNameFromUrl, type SubAgentDefinition, type McpServerConfig, type ApiConfig } from '@craft-agent/shared/agents';
import { debug } from '@craft-agent/shared/utils';

export interface ReauthSelectorProps {
  definition: SubAgentDefinition;
  agentName: string;
  getCredential: (type: 'mcp' | 'api', name: string) => Promise<string | null>;
  clearCredentials: (mcpNames: string[], apiNames: string[]) => Promise<void>;
  onConfirm: (mcpNames: string[], apiNames: string[]) => void;
  onCancel: () => void;
}

interface AuthItem {
  type: 'mcp' | 'api';
  name: string;
  hasCredential: boolean;
  requiresAuth: boolean;
  config: McpServerConfig | ApiConfig;
}

/**
 * Component for selecting which MCP servers and APIs to re-authenticate.
 * Shows all auth-requiring items with their current status, allowing
 * users to select which ones to re-authenticate.
 */
export const ReauthSelector: React.FC<ReauthSelectorProps> = ({
  definition,
  agentName,
  getCredential,
  clearCredentials,
  onConfirm,
  onCancel,
}) => {
  const [items, setItems] = useState<AuthItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Load auth status on mount
  useEffect(() => {
    const loadAuthStatus = async () => {
      const authItems: AuthItem[] = [];

      // Load MCP servers
      if (definition.mcpServers) {
        for (const server of definition.mcpServers) {
          if (!server.requiresAuth) continue;
          const name = server.name || extractNameFromUrl(server.url);
          const value = await getCredential('mcp', name);
          authItems.push({
            type: 'mcp',
            name,
            hasCredential: !!value,
            requiresAuth: true,
            config: server,
          });
        }
      }

      // Load APIs
      if (definition.apis) {
        for (const api of definition.apis) {
          if (!api.auth || api.auth.type === 'none') continue;
          const value = await getCredential('api', api.name);
          authItems.push({
            type: 'api',
            name: api.name,
            hasCredential: !!value,
            requiresAuth: true,
            config: api,
          });
        }
      }

      setItems(authItems);
      setIsLoading(false);
      debug('[ReauthSelector] Loaded', authItems.length, 'auth items');
    };

    loadAuthStatus();
  }, [definition, getCredential]);

  // Toggle selection of an item
  const toggleSelection = useCallback((key: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Handle confirmation - delete selected credentials and trigger reauth
  const handleConfirm = useCallback(async () => {
    const mcpNames: string[] = [];
    const apiNames: string[] = [];

    for (const item of items) {
      const key = `${item.type}-${item.name}`;
      if (selectedItems.has(key)) {
        if (item.type === 'mcp') {
          mcpNames.push(item.name);
        } else {
          apiNames.push(item.name);
        }
      }
    }

    if (mcpNames.length === 0 && apiNames.length === 0) {
      // Nothing selected, just close
      onCancel();
      return;
    }

    // Delete selected credentials
    debug('[ReauthSelector] Deleting credentials:', { mcpNames, apiNames });
    await clearCredentials(mcpNames, apiNames);

    // Trigger reauth flow
    onConfirm(mcpNames, apiNames);
  }, [items, selectedItems, clearCredentials, onConfirm, onCancel]);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (input === ' ') {
      // Toggle selection
      const item = items[selectedIndex];
      if (item) {
        toggleSelection(`${item.type}-${item.name}`);
      }
    } else if (key.return) {
      handleConfirm();
    } else if (key.escape) {
      onCancel();
    } else if (input === 'a' || input === 'A') {
      // Select all
      const allKeys = items.map(item => `${item.type}-${item.name}`);
      setSelectedItems(new Set(allKeys));
    } else if (input === 'n' || input === 'N') {
      // Select none
      setSelectedItems(new Set());
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>Loading auth status...</Text>
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold>Re-authenticate</Text>
          <Text dimColor> (@{agentName})</Text>
        </Box>
        <Text dimColor>No MCP servers or APIs require authentication.</Text>
        <Box marginTop={1}>
          <Text dimColor>Press Esc to close</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold>Re-authenticate</Text>
        <Text dimColor> (@{agentName})</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Select which credentials to refresh:</Text>
      </Box>

      {/* Items list */}
      {items.map((item, index) => {
        const key = `${item.type}-${item.name}`;
        const isHighlighted = index === selectedIndex;
        const isSelected = selectedItems.has(key);
        const typeLabel = item.type === 'mcp' ? 'MCP' : 'API';
        const statusLabel = item.hasCredential ? 'authenticated' : 'missing';
        const statusColor = item.hasCredential ? 'green' : 'red';

        return (
          <Box key={key}>
            <Text
              color={isHighlighted ? 'cyan' : undefined}
              bold={isHighlighted}
              inverse={isHighlighted}
            >
              {' '}
              {isSelected ? (
                <Text color="green">[x]</Text>
              ) : (
                <Text dimColor>[ ]</Text>
              )}{' '}
              <Text>{typeLabel}: </Text>
              <Text bold>{item.name}</Text>
              <Text> (</Text>
              <Text color={statusColor}>{statusLabel}</Text>
              <Text>)</Text>
              {' '}
            </Text>
          </Box>
        );
      })}

      {/* Selection count */}
      {selectedItems.size > 0 && (
        <Box marginTop={1}>
          <Text color="cyan">
            {selectedItems.size} item{selectedItems.size === 1 ? '' : 's'} selected
          </Text>
        </Box>
      )}

      {/* Instructions */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | Space toggle | A all | N none | Enter confirm | Esc cancel
        </Text>
      </Box>
    </Box>
  );
};
