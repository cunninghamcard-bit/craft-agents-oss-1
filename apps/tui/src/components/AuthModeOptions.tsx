import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AuthType } from '@craft-agent/shared/config';

export interface AuthModeOptionsProps {
  authType: 'api_key' | 'oauth_token';
  maskedCredential: string;
  onUseExisting: () => void;
  onReauthenticate: () => void;
  onCancel: () => void;
}

const AUTH_LABELS: Record<Exclude<AuthType, 'craft_credits'>, string> = {
  'api_key': 'API Key',
  'oauth_token': 'Claude Max',
};

export const AuthModeOptions: React.FC<AuthModeOptionsProps> = ({
  authType,
  maskedCredential,
  onUseExisting,
  onReauthenticate,
  onCancel,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const options = [
    {
      label: `Use existing ${authType === 'api_key' ? 'key' : 'token'}`,
      description: maskedCredential,
      action: onUseExisting,
    },
    {
      label: 'Re-authenticate',
      description: authType === 'api_key' ? 'Enter a new API key' : 'Login via browser',
      action: onReauthenticate,
    },
  ];

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
    } else if (key.downArrow) {
      setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
    } else if (key.return) {
      const option = options[selectedIndex];
      if (option) {
        option.action();
      }
    } else if (key.escape) {
      onCancel();
    } else if (input === '1') {
      options[0]?.action();
    } else if (input === '2') {
      options[1]?.action();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Switch to {AUTH_LABELS[authType]}</Text>
      </Box>

      {options.map((option, index) => {
        const isHighlighted = index === selectedIndex;

        return (
          <Box key={index}>
            <Text
              color={isHighlighted ? 'cyan' : undefined}
              bold={isHighlighted}
              inverse={isHighlighted}
            >
              {' '}
              {index + 1}. {option.label}
              <Text dimColor={!isHighlighted}> - {option.description}</Text>
              {' '}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | Enter select | Esc cancel | 1-2 quick select
        </Text>
      </Box>
    </Box>
  );
};
