import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { extractNameFromUrl, type SubAgentDefinition, type McpServerConfig, type ApiConfig } from '@craft-agent/shared/agents';
import { debug, maskCredential } from '@craft-agent/shared/utils';
import { TextInput } from './TextInput.tsx';

export interface CredentialsViewerProps {
  definition: SubAgentDefinition;
  agentName: string;
  getCredential: (type: 'mcp' | 'api', name: string) => Promise<string | null>;
  saveCredential: (type: 'mcp' | 'api', name: string, value: string) => Promise<void>;
  onClose: () => void;
}

interface CredentialItem {
  type: 'mcp' | 'api';
  name: string;
  maskedValue: string;
  hasValue: boolean;
  config: McpServerConfig | ApiConfig;
}

/**
 * Component for viewing and updating stored credentials for the active agent.
 * Shows MCP OAuth tokens and API keys with masked values.
 */
export const CredentialsViewer: React.FC<CredentialsViewerProps> = ({
  definition,
  agentName,
  getCredential,
  saveCredential,
  onClose,
}) => {
  const [credentials, setCredentials] = useState<CredentialItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load credentials on mount
  useEffect(() => {
    const loadCredentials = async () => {
      const items: CredentialItem[] = [];

      // Load MCP server credentials
      if (definition.mcpServers) {
        for (const server of definition.mcpServers) {
          if (!server.requiresAuth) continue;
          const name = server.name || extractNameFromUrl(server.url);
          const value = await getCredential('mcp', name);
          items.push({
            type: 'mcp',
            name,
            maskedValue: maskCredential(value),
            hasValue: !!value,
            config: server,
          });
        }
      }

      // Load API credentials
      if (definition.apis) {
        for (const api of definition.apis) {
          if (!api.auth || api.auth.type === 'none') continue;
          const value = await getCredential('api', api.name);
          items.push({
            type: 'api',
            name: api.name,
            maskedValue: maskCredential(value),
            hasValue: !!value,
            config: api,
          });
        }
      }

      setCredentials(items);
      setIsLoading(false);
      debug('[CredentialsViewer] Loaded', items.length, 'credentials');
    };

    loadCredentials();
  }, [definition, getCredential]);

  // Handle saving new credential value
  const handleSave = useCallback(async (value: string) => {
    if (!value.trim()) {
      setIsEditing(false);
      setInputValue('');
      return;
    }

    const item = credentials[selectedIndex];
    if (!item) return;

    setSaveError(null);

    try {
      await saveCredential(item.type, item.name, value.trim());

      // Update the displayed masked value only on success
      setCredentials(prev => prev.map((c, i) =>
        i === selectedIndex
          ? { ...c, maskedValue: maskCredential(value.trim()), hasValue: true }
          : c
      ));

      setIsEditing(false);
      setInputValue('');
      debug('[CredentialsViewer] Saved credential for', item.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save credential';
      setSaveError(message);
      debug('[CredentialsViewer] Error saving credential:', message);
    }
  }, [credentials, selectedIndex, saveCredential]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setInputValue('');
  }, []);

  useInput((input, key) => {
    if (isEditing) return; // Let TextInput handle input

    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : credentials.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex(prev => (prev < credentials.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      // Start editing
      if (credentials.length > 0) {
        setIsEditing(true);
        setInputValue('');
        setSaveError(null);
      }
    } else if (key.escape) {
      onClose();
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text dimColor>Loading credentials...</Text>
      </Box>
    );
  }

  if (credentials.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold>Stored Credentials</Text>
          <Text dimColor> (@{agentName})</Text>
        </Box>
        <Text dimColor>No credentials stored for this agent.</Text>
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
        <Text bold>Stored Credentials</Text>
        <Text dimColor> (@{agentName})</Text>
      </Box>

      {/* Credentials list */}
      {credentials.map((cred, index) => {
        const isHighlighted = index === selectedIndex;
        const typeLabel = cred.type === 'mcp' ? 'MCP OAuth' : 'API Key';

        return (
          <Box key={`${cred.type}-${cred.name}`}>
            <Text
              color={isHighlighted ? 'cyan' : undefined}
              bold={isHighlighted}
              inverse={isHighlighted}
            >
              {' '}
              {cred.hasValue ? (
                <Text color="green">●</Text>
              ) : (
                <Text color="red">○</Text>
              )}{' '}
              <Text>{typeLabel}: </Text>
              <Text bold>{cred.name}</Text>
              <Text dimColor={!isHighlighted}> - {cred.maskedValue}</Text>
              {' '}
            </Text>
          </Box>
        );
      })}

      {/* Edit input */}
      {isEditing && (
        <Box marginY={1} flexDirection="column">
          <Text>
            Enter new value for <Text bold color="cyan">{credentials[selectedIndex]?.name}</Text>
          </Text>
          <Box marginTop={1}>
            <Text color="green">&gt; </Text>
            <TextInput
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleSave}
              onCancel={handleCancelEdit}
              placeholder="Paste new credential value..."
              mask="•"
              maskReveal={{ last: 4 }}
            />
          </Box>
          {saveError && (
            <Box marginTop={1}>
              <Text color="red">Error: {saveError}</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Instructions */}
      <Box marginTop={1}>
        <Text dimColor>
          {isEditing
            ? 'Enter to save | Esc to cancel'
            : '↑↓ navigate | Enter to overwrite | Esc close'
          }
        </Text>
      </Box>
    </Box>
  );
};
