import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

export interface AskUserQuestionProps {
  questions: Question[];
  onSubmit: (answers: Record<string, string>) => void;
  onCancel?: () => void;
}

export const AskUserQuestion: React.FC<AskUserQuestionProps> = ({
  questions,
  onSubmit,
  onCancel,
}) => {
  // Current question index
  const [questionIndex, setQuestionIndex] = useState(0);
  // Currently highlighted option for each question
  const [highlightedOptions, setHighlightedOptions] = useState<number[]>(
    questions.map(() => 0)
  );
  // Selected options for each question (for multiSelect, can have multiple)
  const [selectedOptions, setSelectedOptions] = useState<Set<number>[]>(
    questions.map(() => new Set<number>())
  );
  // For single select, track the chosen option
  const [singleSelections, setSingleSelections] = useState<(number | null)[]>(
    questions.map(() => null)
  );

  const currentQuestion = questions[questionIndex];
  const currentHighlight = highlightedOptions[questionIndex] ?? 0;
  const currentSelected = selectedOptions[questionIndex] ?? new Set<number>();
  const currentSingleSelection = singleSelections[questionIndex];

  const handleSubmit = useCallback(() => {
    // Build answers object
    const answers: Record<string, string> = {};

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;

      if (q.multiSelect) {
        const selected = selectedOptions[i] ?? new Set<number>();
        const labels = Array.from(selected)
          .map(idx => q.options[idx]?.label)
          .filter(Boolean)
          .join(', ');
        answers[q.question] = labels || 'None selected';
      } else {
        const idx = singleSelections[i];
        if (idx !== null && idx !== undefined) {
          answers[q.question] = q.options[idx]?.label ?? '';
        } else {
          answers[q.question] = '';
        }
      }
    }

    onSubmit(answers);
  }, [questions, selectedOptions, singleSelections, onSubmit]);

  useInput((input, key) => {
    if (!currentQuestion) return;

    // Navigation
    if (key.upArrow) {
      setHighlightedOptions(prev => {
        const newHighlights = [...prev];
        const current = newHighlights[questionIndex] ?? 0;
        newHighlights[questionIndex] = current > 0
          ? current - 1
          : currentQuestion.options.length - 1;
        return newHighlights;
      });
    } else if (key.downArrow) {
      setHighlightedOptions(prev => {
        const newHighlights = [...prev];
        const current = newHighlights[questionIndex] ?? 0;
        newHighlights[questionIndex] = current < currentQuestion.options.length - 1
          ? current + 1
          : 0;
        return newHighlights;
      });
    }
    // Tab to switch questions
    else if (key.tab && questions.length > 1) {
      if (key.shift) {
        setQuestionIndex(prev => prev > 0 ? prev - 1 : questions.length - 1);
      } else {
        setQuestionIndex(prev => prev < questions.length - 1 ? prev + 1 : 0);
      }
    }
    // Space to toggle/select
    else if (input === ' ') {
      if (currentQuestion.multiSelect) {
        // Toggle selection
        setSelectedOptions(prev => {
          const newSelected = [...prev];
          const current = new Set(newSelected[questionIndex]);
          if (current.has(currentHighlight)) {
            current.delete(currentHighlight);
          } else {
            current.add(currentHighlight);
          }
          newSelected[questionIndex] = current;
          return newSelected;
        });
      } else {
        // Single select
        setSingleSelections(prev => {
          const newSelections = [...prev];
          newSelections[questionIndex] = currentHighlight;
          return newSelections;
        });
      }
    }
    // Enter to confirm/next/submit
    else if (key.return) {
      // For single select, select current if nothing selected
      if (!currentQuestion.multiSelect && currentSingleSelection === null) {
        setSingleSelections(prev => {
          const newSelections = [...prev];
          newSelections[questionIndex] = currentHighlight;
          return newSelections;
        });
      }

      // If more questions, go to next
      if (questionIndex < questions.length - 1) {
        setQuestionIndex(prev => prev + 1);
      } else {
        // Submit all answers
        handleSubmit();
      }
    }
    // Escape to cancel
    else if (key.escape) {
      onCancel?.();
    }
    // Number keys for quick select
    else if (input >= '1' && input <= String(currentQuestion.options.length)) {
      const idx = parseInt(input, 10) - 1;
      if (currentQuestion.multiSelect) {
        setSelectedOptions(prev => {
          const newSelected = [...prev];
          const current = new Set(newSelected[questionIndex]);
          if (current.has(idx)) {
            current.delete(idx);
          } else {
            current.add(idx);
          }
          newSelected[questionIndex] = current;
          return newSelected;
        });
      } else {
        setSingleSelections(prev => {
          const newSelections = [...prev];
          newSelections[questionIndex] = idx;
          return newSelections;
        });
      }
      setHighlightedOptions(prev => {
        const newHighlights = [...prev];
        newHighlights[questionIndex] = idx;
        return newHighlights;
      });
    }
  });

  if (!currentQuestion) {
    return null;
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} paddingY={1}>
      {/* Header chip */}
      <Box marginBottom={1}>
        <Text backgroundColor="cyan" color="black" bold>
          {' '}{currentQuestion.header}{' '}
        </Text>
        {questions.length > 1 && (
          <Text dimColor> ({questionIndex + 1}/{questions.length})</Text>
        )}
      </Box>

      {/* Question text */}
      <Box marginBottom={1}>
        <Text bold>{currentQuestion.question}</Text>
      </Box>

      {/* Options */}
      {currentQuestion.options.map((option, index) => {
        const isHighlighted = index === currentHighlight;
        const isSelected = currentQuestion.multiSelect
          ? currentSelected.has(index)
          : currentSingleSelection === index;

        // Checkbox/Radio visual
        const indicator = currentQuestion.multiSelect
          ? (isSelected ? '[✓]' : '[ ]')
          : (isSelected ? '(●)' : '( )');

        return (
          <Box key={index} flexDirection="column" marginLeft={1}>
            <Box>
              <Text
                color={isHighlighted ? 'cyan' : undefined}
                bold={isHighlighted}
                inverse={isHighlighted}
              >
                {' '}{indicator} {index + 1}. {option.label}{' '}
              </Text>
            </Box>
            {option.description && (
              <Box marginLeft={4}>
                <Text dimColor>{option.description}</Text>
              </Box>
            )}
          </Box>
        );
      })}

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>
          ↑↓ navigate | {currentQuestion.multiSelect ? 'Space toggle' : 'Space select'} | Enter {questionIndex < questions.length - 1 ? 'next' : 'submit'}
          {questions.length > 1 && ' | Tab switch'}
          {onCancel && ' | Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
};
