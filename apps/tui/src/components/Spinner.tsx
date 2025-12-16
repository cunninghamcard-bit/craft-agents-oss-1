import React, { memo, useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { formatDuration } from '../utils/markdown.js';

// Full braille cell spinner - more vertically centered than top-weighted dots
const SPINNER_FRAMES = ['⣷', '⣯', '⣟', '⡿', '⢿', '⣻', '⣽', '⣾'];

export interface AnimatedSpinnerProps {
  color?: string;
}

/**
 * Animated spinner with braille dots
 */
export const AnimatedSpinner: React.FC<AnimatedSpinnerProps> = memo(
  ({ color = 'yellow' }) => {
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
      }, 80);

      return () => clearInterval(interval);
    }, []);

    return <Text color={color}>{SPINNER_FRAMES[frameIndex]}</Text>;
  }
);

export interface SpinnerProps {
  label?: string;
  color?: string;
}

/**
 * Static spinner (for cases where animation isn't desired)
 */
export const Spinner: React.FC<SpinnerProps> = memo(
  ({ label = 'Loading', color = 'cyan' }) => {
    return (
      <Box>
        <Text color={color}>●</Text>
        <Text dimColor> {label}...</Text>
      </Box>
    );
  }
);

export interface ThinkingIndicatorProps {
  status?: string;
  elapsedMs?: number;
  animated?: boolean;
}

/**
 * Thinking indicator with optional animated spinner and elapsed time
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = memo(
  ({ status, elapsedMs, animated = true }) => {
    return (
      <Box paddingLeft={1} marginY={1}>
        {animated ? <AnimatedSpinner /> : <Text color="yellow">●</Text>}
        <Text color="gray"> {status || 'Thinking...'}</Text>
        {elapsedMs !== undefined && elapsedMs >= 1000 && (
          <Text dimColor> ({formatDuration(elapsedMs)})</Text>
        )}
      </Box>
    );
  }
);
