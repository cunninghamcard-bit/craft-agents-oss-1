import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ApiKeyChangeProps {
  onSubmit: (newApiKey: string) => void;
  onCancel: () => void;
}

export const ApiKeyChange: React.FC<ApiKeyChangeProps> = ({
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState('');

  useInput((input, key) => {
    if (key.return) {
      const trimmed = value.trim();
      if (trimmed) {
        onSubmit(trimmed);
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    // Handle Ctrl+U to clear
    if (input === '\x15') {
      setValue('');
      return;
    }

    // Ignore control characters
    if (key.ctrl || key.meta || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      return;
    }

    // Add printable characters (supports paste - multi-char input)
    if (input && input.length >= 1) {
      // Strip bracketed paste markers
      const chars = input.replace(/\x1b\[200~/g, '').replace(/\x1b\[201~/g, '');
      // Filter to printable characters
      const printable = chars.split('').filter((c) => c.charCodeAt(0) >= 32).join('');
      if (printable) {
        setValue((prev) => prev + printable);
      }
    }
  });

  // Mask the API key for display, showing only last 4 chars
  const maskedValue = value.length > 4
    ? '•'.repeat(value.length - 4) + value.slice(-4)
    : '•'.repeat(value.length);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold>Change API Key</Text>
      </Box>

      <Box>
        <Text>New API key: </Text>
        {value.length === 0 ? (
          <>
            <Text color="blue">▌</Text>
            <Text dimColor>sk-ant-...</Text>
          </>
        ) : (
          <>
            <Text color="blue">{maskedValue}</Text>
            <Text color="blue">▌</Text>
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Enter confirm | Esc cancel | Ctrl+U clear
        </Text>
      </Box>
    </Box>
  );
};
