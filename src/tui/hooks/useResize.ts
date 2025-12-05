import { useEffect, useState, useCallback } from 'react';

/**
 * Hook that handles terminal resize
 * Returns current dimensions and a resetKey that increments on resize
 * The resetKey can be used to re-render Static content after screen clear
 */
export function useResize(): { columns: number; rows: number; resetKey: number } {
  const [dimensions, setDimensions] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  });
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const handleResize = () => {
      // Clear the screen on resize to prevent artifacts
      process.stdout.write('\x1b[2J\x1b[H');

      setDimensions({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      });

      // Increment resetKey so Static content gets re-rendered
      setResetKey(k => k + 1);
    };

    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return { ...dimensions, resetKey };
}
