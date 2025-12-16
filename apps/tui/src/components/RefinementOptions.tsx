import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface RefinementOptionsProps {
  onDone: () => void;
  onMoreInput: () => void;
  isLastRound?: boolean;
}

export const RefinementOptions: React.FC<RefinementOptionsProps> = ({
  onDone,
  onMoreInput,
  isLastRound = false,
}) => {
  const [selectedOption, setSelectedOption] = useState(0);

  useInput((input, key) => {
    if (isLastRound) {
      // Only "Done" is available
      if (key.return || input === '1') {
        onDone();
      }
      return;
    }

    // Navigation (only when both options available)
    if (key.upArrow || key.downArrow) {
      setSelectedOption(prev => prev === 0 ? 1 : 0);
    }
    // Enter to confirm
    else if (key.return) {
      if (selectedOption === 0) {
        onDone();
      } else {
        onMoreInput();
      }
    }
    // Number keys for quick select
    else if (input === '1') {
      onDone();
    } else if (input === '2') {
      onMoreInput();
    }
  });

  if (isLastRound) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} paddingY={1}>
        <Text bold color="green">Clarification Review</Text>
        <Box marginTop={1} flexDirection="column">
          <Text color="cyan" bold>
            {'>'} 1. Done, Ready to Save
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter or 1 to save</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={1} paddingY={1}>
      <Text bold color="green">Clarification Review</Text>
      <Box marginTop={1} flexDirection="column">
        <Text
          color={selectedOption === 0 ? 'cyan' : undefined}
          bold={selectedOption === 0}
        >
          {selectedOption === 0 ? '>' : ' '} 1. Done, Ready to Save
        </Text>
        <Text
          color={selectedOption === 1 ? 'cyan' : undefined}
          bold={selectedOption === 1}
        >
          {selectedOption === 1 ? '>' : ' '} 2. I have more input
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑↓ select | Enter confirm | 1-2 quick select</Text>
      </Box>
    </Box>
  );
};
