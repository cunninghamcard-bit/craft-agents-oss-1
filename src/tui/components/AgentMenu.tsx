import React, { useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

export type AgentAction =
  | { type: 'activate'; name: string }
  | { type: 'clear' }
  | { type: 'reload' }
  | { type: 'reset' }
  | { type: 'refresh' }
  | { type: 'info' };

export interface AgentMenuProps {
  agents: string[];
  activeAgentName: string | null;
  onAction: (action: AgentAction) => void;
  onCancel: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  desc: string;
  action: AgentAction;
  requiresActive?: boolean;
}

export const AgentMenu: React.FC<AgentMenuProps> = ({
  agents,
  activeAgentName,
  onAction,
  onCancel,
}) => {
  // Build menu items: commands first, then agents
  const menuItems: MenuItem[] = [];

  // Add commands
  if (activeAgentName) {
    menuItems.push({
      key: 'clear',
      label: 'Exit',
      desc: 'Return to main assistant',
      action: { type: 'clear' },
    });
    menuItems.push({
      key: 'reload',
      label: 'Reload',
      desc: 'Reload agent instructions',
      action: { type: 'reload' },
      requiresActive: true,
    });
    menuItems.push({
      key: 'reset',
      label: 'Reset',
      desc: 'Clear all data and exit (re-select to restart setup)',
      action: { type: 'reset' },
      requiresActive: true,
    });
    menuItems.push({
      key: 'info',
      label: 'Info',
      desc: 'Show active agent details',
      action: { type: 'info' },
      requiresActive: true,
    });
  }

  menuItems.push({
    key: 'refresh',
    label: 'Refresh',
    desc: 'Re-scan Agents folder',
    action: { type: 'refresh' },
  });

  // Add separator label index
  const agentStartIndex = menuItems.length;

  // Add available agents (sorted alphabetically)
  const sortedAgents = [...agents].sort((a, b) => a.localeCompare(b));
  for (const agent of sortedAgents) {
    menuItems.push({
      key: `agent-${agent}`,
      label: `@${agent}`,
      desc: agent === activeAgentName ? '(active)' : 'Activate agent',
      action: { type: 'activate', name: agent },
    });
  }

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchBuffer, setSearchBuffer] = useState('');
  const lastKeystrokeRef = useRef<number>(0);

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : menuItems.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < menuItems.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const item = menuItems[selectedIndex];
      if (item) {
        onAction(item.action);
      }
    } else if (key.escape) {
      onCancel();
    } else if (input && input.length === 1 && /[a-z0-9/\-]/i.test(input)) {
      // Type-ahead search for agents
      const now = Date.now();
      const timeSinceLastKey = now - lastKeystrokeRef.current;
      lastKeystrokeRef.current = now;

      // Reset buffer if too much time passed (500ms)
      const newBuffer = timeSinceLastKey > 500 ? input.toLowerCase() : searchBuffer + input.toLowerCase();
      setSearchBuffer(newBuffer);

      // Find matching agent - prefer prefix match, fall back to contains
      const agentItems = menuItems
        .map((item, idx) => ({ item, idx }))
        .filter(({ idx }) => idx >= agentStartIndex);

      // First try prefix match
      const prefixMatch = agentItems.find(({ item }) =>
        item.label.slice(1).toLowerCase().startsWith(newBuffer)
      );

      if (prefixMatch) {
        setSelectedIndex(prefixMatch.idx);
      } else {
        // Fall back to contains match (e.g., "wo" matches "test/word-counter")
        const containsMatch = agentItems.find(({ item }) =>
          item.label.slice(1).toLowerCase().includes(newBuffer)
        );
        if (containsMatch) {
          setSelectedIndex(containsMatch.idx);
        }
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text>
          <Text bold>Agent Menu</Text>
          {activeAgentName && (
            <Text dimColor> (Active: @{activeAgentName})</Text>
          )}
        </Text>
      </Box>

      {menuItems.map((item, index) => {
        const isHighlighted = index === selectedIndex;
        const isAgentSection = index === agentStartIndex && agents.length > 0;

        return (
          <React.Fragment key={item.key}>
            {isAgentSection && (
              <Box marginTop={1} marginBottom={0}>
                <Text dimColor>── Agents ──</Text>
              </Box>
            )}
            <Box>
              <Text
                color={isHighlighted ? 'magenta' : undefined}
                bold={isHighlighted}
                inverse={isHighlighted}
              >
                {' '}
                {item.label}
                <Text dimColor={!isHighlighted}> - {item.desc}</Text>
                {' '}
              </Text>
            </Box>
          </React.Fragment>
        );
      })}

      {agents.length === 0 && (
        <Box marginTop={1}>
          <Text dimColor italic>No agents found. Use Refresh to scan.</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | Enter select | Esc cancel
        </Text>
      </Box>
    </Box>
  );
};
