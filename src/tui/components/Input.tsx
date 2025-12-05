import React, { useState, useCallback, memo, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { getCommandHint, getAgentHint, getTabCompletion, type HintData } from '../utils/filtering.ts';

export interface InputProps {
  onSubmit: (input: string) => void;
  onPaste?: () => void;
  onRemoveAttachment?: () => void;
  onClearAttachments?: () => void;
  onPastedText?: (text: string) => void;
  disabled?: boolean;
  history?: string[];
  placeholder?: string;
  attachmentCount?: number;
  attachmentLabel?: string;
  columns?: number;
  /** Available sub-agent names for @mention autocomplete */
  availableAgents?: string[];
  /** Currently active agent name (for dynamic placeholder) */
  activeAgentName?: string;
}

// Simple custom text input without cursor animation
const SimpleTextInput: React.FC<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onBackspaceEmpty?: () => void;
  onPastedText?: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}> = ({ value, onChange, onSubmit, onBackspaceEmpty, onPastedText, placeholder = '', disabled = false }) => {
  useInput(
    (input, key) => {
      if (disabled) return;

      if (key.return) {
        // Check if the current input looks like a file path (not a slash command)
        // File paths: /Users/..., ~/Documents/... but NOT /clear, /help, etc.
        const trimmed = value.trim();
        const looksLikeFilePath = trimmed.startsWith('~/') ||
          (trimmed.startsWith('/') && trimmed.length > 2 && trimmed.slice(1).includes('/'));

        if (onPastedText && trimmed && looksLikeFilePath) {
          onPastedText(trimmed);
          onChange('');
          return;
        }
        onSubmit(value);
        return;
      }

      if (key.backspace || key.delete) {
        if (value.length === 0 && onBackspaceEmpty) {
          onBackspaceEmpty();
        } else {
          onChange(value.slice(0, -1));
        }
        return;
      }

      // Ignore control characters
      if (key.ctrl || key.meta || key.escape || key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
        return;
      }

      // Get printable input
      if (input && input.length >= 1) {
        // Strip bracketed paste markers
        const chars = input.replace(/\x1b\[200~/g, '').replace(/\x1b\[201~/g, '');
        // Filter to printable characters
        const printable = chars.split('').filter(c => c.charCodeAt(0) >= 32).join('');

        if (printable) {
          // Check if this is a pasted file path (multi-char input with path structure)
          const looksLikePastedPath = printable.startsWith('~/') ||
            (printable.startsWith('/') && printable.length > 2 && printable.slice(1).includes('/'));

          if (onPastedText && printable.length > 1 && looksLikePastedPath) {
            onPastedText(printable);
          } else {
            onChange(value + printable);
          }
        }
      }
    },
    { isActive: !disabled }
  );

  const displayValue = value || '';
  const showPlaceholder = displayValue.length === 0;

  return (
    <Text>
      {showPlaceholder ? (
        <>
          {!disabled && <Text color="blue">▌</Text>}
          <Text dimColor>{placeholder}</Text>
        </>
      ) : (
        <>
          <Text>{displayValue}</Text>
          {!disabled && <Text color="blue">▌</Text>}
        </>
      )}
    </Text>
  );
};

// Horizontal line for top/bottom borders
const HorizontalLine: React.FC<{ color: string; columns: number }> = ({ color, columns }) => {
  const width = Math.max(20, columns - 2);
  return (
    <Text color={color}>{'─'.repeat(width)}</Text>
  );
};

// Memoized prompt character
const InputPrompt = memo<{ disabled: boolean }>(({ disabled }) => (
  <Text color={disabled ? 'gray' : 'blue'} bold>
    {disabled ? '◌' : '>'}{' '}
  </Text>
));

export const Input: React.FC<InputProps> = ({
  onSubmit,
  onPaste,
  onRemoveAttachment,
  onClearAttachments,
  onPastedText,
  disabled = false,
  history = [],
  placeholder,
  attachmentCount = 0,
  attachmentLabel,
  columns = 80,
  availableAgents = [],
  activeAgentName,
}) => {
  const [value, setValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);

  const handleSubmit = useCallback(
    (input: string) => {
      if (input.trim() && !disabled) {
        onSubmit(input.trim());
        setValue('');
        setHistoryIndex(-1);
      }
    },
    [onSubmit, disabled]
  );

  useInput(
    (input, key) => {
      if (disabled) return;

      // Handle Tab for auto-completion
      if (key.tab) {
        const completion = getTabCompletion(value, availableAgents);
        if (completion) {
          setValue(completion);
          setHistoryIndex(-1);
        }
        return;
      }

      // Handle up arrow for history
      if (key.upArrow && history.length > 0) {
        const newIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(newIndex);
        setValue(history[history.length - 1 - newIndex] || '');
      }

      // Handle down arrow for history
      if (key.downArrow && historyIndex > -1) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        if (newIndex < 0) {
          setValue('');
        } else {
          setValue(history[history.length - 1 - newIndex] || '');
        }
      }

      // Handle Ctrl+U to clear line (Ctrl+U = ASCII 21 = '\x15')
      if (input === '\x15' || (key.ctrl && input === 'u')) {
        setValue('');
        setHistoryIndex(-1);
      }

      // Handle Escape to clear input and attachments (when not processing - App handles interrupt)
      if (key.escape && !disabled) {
        if (value.length > 0) {
          setValue('');
          setHistoryIndex(-1);
        }
        if (onClearAttachments) {
          onClearAttachments();
        }
      }

      // Handle paste from clipboard
      // Ctrl+V (ASCII 22 / 0x16) - often intercepted by terminal
      // Ctrl+P (ASCII 16 / 0x10) - alternative that works in more terminals
      const charCode = input.charCodeAt(0);
      const isCtrlV = charCode === 22 || input === '\x16' || (key.ctrl && (input === 'v' || input === 'V'));
      const isCtrlP = charCode === 16 || input === '\x10' || (key.ctrl && (input === 'p' || input === 'P'));
      if (isCtrlV || isCtrlP) {
        if (onPaste) onPaste();
      }
    },
    { isActive: !disabled }
  );

  // Determine placeholder text - dynamic based on active agent
  const placeholderText = disabled
    ? 'Thinking...'
    : placeholder
      ? placeholder
      : activeAgentName
        ? `Message @${activeAgentName}...`
        : 'Message Craft...';

  // Memoize command/mention hint to avoid recalculation
  const hintData = useMemo((): HintData | null => {
    // @mention hints
    if (value.startsWith('@')) {
      return getAgentHint(value.slice(1), availableAgents);
    }
    // Slash command hints
    if (value.startsWith('/')) {
      return getCommandHint(value);
    }
    return null;
  }, [value, availableAgents]);

  const lineColor = disabled ? 'gray' : 'blue';

  // Check if we have any hint to show
  const hasHint = hintData && (hintData.selected || hintData.others.length > 0);

  return (
    <Box flexDirection="column" width="100%">
      {!disabled && hasHint && (
        <Box paddingLeft={2} marginBottom={1}>
          {hintData.selected ? (
            // Show selected (highlighted) + description + others
            <Text>
              <Text color="blue" bold>{hintData.selected}</Text>
              {hintData.description && <Text dimColor>: {hintData.description}</Text>}
              {hintData.others.length > 0 && (
                <Text dimColor>  {hintData.others.join('  ')}</Text>
              )}
            </Text>
          ) : (
            // No selection, just show options
            <Text dimColor>{hintData.others.join('  ')}</Text>
          )}
        </Box>
      )}
      {/* Top line */}
      <HorizontalLine color={lineColor} columns={columns} />
      {/* Input row */}
      <Box paddingX={1}>
        <InputPrompt disabled={disabled} />
        {attachmentCount > 0 && (
          <Text color="cyan">
            [{attachmentLabel || (attachmentCount === 1 ? '1 file' : `${attachmentCount} files`)}]{' '}
          </Text>
        )}
        <SimpleTextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          onBackspaceEmpty={onRemoveAttachment}
          onPastedText={onPastedText}
          placeholder={placeholderText}
          disabled={disabled}
        />
      </Box>
      {/* Bottom line */}
      <HorizontalLine color={lineColor} columns={columns} />
    </Box>
  );
};

/**
 * Multiline input hint component
 */
export const InputHint: React.FC<{ visible?: boolean }> = memo(({ visible = true }) => {
  if (!visible) return null;

  return (
    <Box paddingX={1} marginTop={1}>
      <Text dimColor>
        Enter send | ↑↓ history | /paste or drag files | ⌫ remove file | Ctrl+C exit
      </Text>
    </Box>
  );
});
