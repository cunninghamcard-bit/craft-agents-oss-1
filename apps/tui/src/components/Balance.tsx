import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { AuthType } from '@craft-agent/shared/config';

const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  'api_key': 'Anthropic API Key',
  'oauth_token': 'Claude Max Subscription',
};

export interface BalanceProps {
  authType: AuthType;
  onClose: () => void;
}

export const Balance: React.FC<BalanceProps> = ({ authType, onClose }) => {
  useInput((_input, key) => {
    if (key.escape || key.return) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>AI Billing</Text>
      </Box>

      <Box flexDirection="column">
        <Text>
          Current billing: <Text color="cyan" bold>{AUTH_TYPE_LABELS[authType]}</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          To change your billing method, use <Text color="white">/settings</Text>
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press Enter or Esc to close
        </Text>
      </Box>
    </Box>
  );
};
