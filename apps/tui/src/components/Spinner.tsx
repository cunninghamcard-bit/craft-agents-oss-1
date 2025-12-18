import React, { memo, useState, useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { formatDuration } from '../utils/markdown.js';
import { renderUltrathinkGradient } from '../utils/gradient.js';

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
  isUltrathink?: boolean;
}

/**
 * Thinking indicator with optional animated spinner and elapsed time
 * Supports ultrathink mode with shimmering glass gradient text display
 */
export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = memo(
  ({ status, elapsedMs, animated = true, isUltrathink = false }) => {
    // Animate gradient offset for shimmering glass effect
    const [gradientOffset, setGradientOffset] = useState(0);

    useEffect(() => {
      if (!isUltrathink || !animated) return;

      const interval = setInterval(() => {
        setGradientOffset((prev) => (prev + 1) % 10);
      }, 120); // Smooth shimmer animation

      return () => clearInterval(interval);
    }, [isUltrathink, animated]);

    return (
      <Box paddingLeft={1} marginY={1}>
        {animated ? (
          <AnimatedSpinner color={isUltrathink ? 'magenta' : 'yellow'} />
        ) : (
          <Text color={isUltrathink ? 'magenta' : 'yellow'}>●</Text>
        )}
        {isUltrathink ? (
          <>
            <Text> </Text>
            <Text>{renderUltrathinkGradient("Deep thinking...", gradientOffset)}</Text>
          </>
        ) : (
          <Text color="gray"> {status || 'Thinking...'}</Text>
        )}
        {elapsedMs !== undefined && elapsedMs >= 1000 && (
          <Text dimColor> ({formatDuration(elapsedMs)})</Text>
        )}
      </Box>
    );
  }
);
