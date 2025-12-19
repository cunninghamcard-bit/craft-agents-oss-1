import type { ComponentEntry } from './types'
import { useState, useEffect, type ReactNode } from 'react'
import { TurnCard, type ActivityItem, type ResponseContent } from '@/components/chat/TurnCard'

/** Wrapper with padding for playground preview */
function PaddedWrapper({ children }: { children: ReactNode }) {
  return <div className="p-8">{children}</div>
}

// ============================================================================
// Streaming Simulation Components
// ============================================================================

const streamingTextSample = `I've analyzed the authentication system and here's what I found:

## Authentication Architecture

The authentication system is built around three main components:

### 1. AuthHandler (\`src/auth/index.ts\`)
- Manages the OAuth 2.0 flow
- Handles token validation and refresh
- Provides session management

\`\`\`typescript
export class AuthHandler {
  async authenticate(credentials: Credentials): Promise<Session> {
    const token = await this.oauth.getToken(credentials);
    return this.createSession(token);
  }
}
\`\`\`

### 2. TokenManager
- Stores tokens securely using encryption
- Handles automatic token refresh before expiry

### 3. SessionStore
- Maintains active user sessions
- Handles session timeout and cleanup

Would you like me to implement any improvements?`

/**
 * Realistic streaming simulation with:
 * - Fast character streaming (simulates real LLM token rate)
 * - Component batching accumulates into word-sized chunks
 * - Pauses at punctuation for natural rhythm
 */
function useStreamingSimulation(
  fullText: string,
  speed: 'slow' | 'normal' | 'fast' = 'normal',
) {
  const [streamedText, setStreamedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    setStreamedText('')
    setIsComplete(false)
    let index = 0
    let timeoutId: ReturnType<typeof setTimeout>

    // Speed configs: chars per tick, base interval
    // Fast intervals let component batching accumulate words
    const speedConfig = {
      slow: { charsPerTick: 1, baseInterval: 20, punctuationDelay: 300 },
      normal: { charsPerTick: 2, baseInterval: 10, punctuationDelay: 150 },
      fast: { charsPerTick: 4, baseInterval: 5, punctuationDelay: 50 },
    }
    const config = speedConfig[speed]

    function tick() {
      if (index >= fullText.length) {
        setIsComplete(true)
        return
      }

      const currentChar = fullText[index]
      const isPunctuation = /[.!?,;:\n]/.test(currentChar)

      // Send chars
      index = Math.min(index + config.charsPerTick, fullText.length)
      setStreamedText(fullText.slice(0, index))

      // Pause at punctuation for natural rhythm
      const nextInterval = isPunctuation
        ? config.punctuationDelay
        : config.baseInterval

      timeoutId = setTimeout(tick, nextInterval)
    }

    // Start with small delay
    timeoutId = setTimeout(tick, 100)

    return () => clearTimeout(timeoutId)
  }, [fullText, speed])

  return { streamedText, isComplete }
}

/** TurnCard wrapper that simulates streaming response */
function StreamingSimulationTurnCard({
  activities,
  intent,
  simulationSpeed = 'normal',
}: {
  activities: ActivityItem[]
  intent?: string
  simulationSpeed?: 'slow' | 'normal' | 'fast'
}) {
  const { streamedText, isComplete } = useStreamingSimulation(
    streamingTextSample,
    simulationSpeed,
  )

  const response: ResponseContent = {
    text: streamedText,
    isStreaming: !isComplete,
  }

  return (
    <TurnCard
      activities={activities}
      response={response}
      intent={intent}
      isStreaming={!isComplete}
      isComplete={isComplete}
      onOpenFile={(path) => console.log('[Playground] Open file:', path)}
      onOpenUrl={(url) => console.log('[Playground] Open URL:', url)}
    />
  )
}

// ============================================================================
// Sample Data
// ============================================================================

const now = Date.now()

// Completed tool activities
const completedGrepActivity: ActivityItem = {
  id: 'tool-1',
  type: 'tool',
  status: 'completed',
  toolName: 'Grep',
  toolInput: { pattern: 'AuthHandler', path: 'src/' },
  intent: 'Searching for authentication handlers',
  timestamp: now - 5000,
}

const completedReadActivity1: ActivityItem = {
  id: 'tool-2',
  type: 'tool',
  status: 'completed',
  toolName: 'Read',
  toolInput: { file_path: '/src/auth/index.ts' },
  timestamp: now - 4000,
}

const completedReadActivity2: ActivityItem = {
  id: 'tool-3',
  type: 'tool',
  status: 'completed',
  toolName: 'Read',
  toolInput: { file_path: '/src/auth/oauth.ts' },
  timestamp: now - 3000,
}

const completedBashActivity: ActivityItem = {
  id: 'tool-4',
  type: 'tool',
  status: 'completed',
  toolName: 'Bash',
  toolInput: { command: 'npm test', description: 'Running tests' },
  intent: 'Running the test suite',
  timestamp: now - 2000,
}

// Running tool activities
const runningGrepActivity: ActivityItem = {
  id: 'tool-running-1',
  type: 'tool',
  status: 'running',
  toolName: 'Grep',
  toolInput: { pattern: 'handleError', path: 'src/' },
  intent: 'Finding error handling patterns',
  timestamp: now - 1000,
}

const runningReadActivity: ActivityItem = {
  id: 'tool-running-2',
  type: 'tool',
  status: 'running',
  toolName: 'Read',
  toolInput: { file_path: '/src/lib/errors.ts' },
  timestamp: now - 500,
}

// Error activity
const errorActivity: ActivityItem = {
  id: 'tool-error-1',
  type: 'tool',
  status: 'error',
  toolName: 'Bash',
  toolInput: { command: 'npm run deploy' },
  error: 'Permission denied',
  timestamp: now - 1000,
}

// Pending activities
const pendingActivity: ActivityItem = {
  id: 'tool-pending-1',
  type: 'tool',
  status: 'pending',
  toolName: 'Write',
  toolInput: { file_path: '/src/auth/new-handler.ts' },
  timestamp: now,
}

// Intermediate messages (LLM commentary between tool calls)
const intermediateMessage1: ActivityItem = {
  id: 'intermediate-1',
  type: 'intermediate',
  status: 'completed',
  content: "Let me search for the authentication handlers in your codebase...",
  timestamp: now - 6000,
}

const intermediateMessage2: ActivityItem = {
  id: 'intermediate-2',
  type: 'intermediate',
  status: 'completed',
  content: "Found some matches. Now let me read the main auth file to understand the implementation.",
  timestamp: now - 3500,
}

const intermediateMessage3: ActivityItem = {
  id: 'intermediate-3',
  type: 'intermediate',
  status: 'completed',
  content: "I see this uses OAuth 2.0. Let me also check how tokens are managed.",
  timestamp: now - 2500,
}

const intermediateMessageRunning: ActivityItem = {
  id: 'intermediate-running',
  type: 'intermediate',
  status: 'completed',
  content: "Let me run the tests to make sure everything works correctly...",
  timestamp: now - 1500,
}

const intermediateMessageStreaming: ActivityItem = {
  id: 'intermediate-streaming',
  type: 'intermediate',
  status: 'running',  // Still streaming - will show "Thinking..."
  content: "",  // Content not shown while streaming
  timestamp: now,
}

// Sample responses
const shortResponse: ResponseContent = {
  text: "I found the authentication handlers in `src/auth/`. The main handler is `AuthHandler` which manages OAuth flows and token validation.",
  isStreaming: false,
}

const longResponse: ResponseContent = {
  text: `I've analyzed the authentication system and here's what I found:

## Authentication Architecture

The authentication system is built around three main components:

### 1. AuthHandler (\`src/auth/index.ts\`)
- Manages the OAuth 2.0 flow
- Handles token validation and refresh
- Provides session management

\`\`\`typescript
export class AuthHandler {
  async authenticate(credentials: Credentials): Promise<Session> {
    // OAuth flow implementation
    const token = await this.oauth.getToken(credentials);
    return this.createSession(token);
  }
}
\`\`\`

### 2. TokenManager (\`src/auth/tokens.ts\`)
- Stores tokens securely using encryption
- Handles automatic token refresh before expiry
- Provides token revocation

### 3. SessionStore (\`src/auth/sessions.ts\`)
- Maintains active user sessions
- Handles session timeout and cleanup
- Provides session restoration on app restart

## Recommendations

1. **Add refresh token rotation** - Currently tokens are reused until expiry
2. **Implement PKCE** - For better security in public clients
3. **Add audit logging** - Track authentication events for security monitoring

Would you like me to implement any of these improvements?`,
  isStreaming: false,
}

const streamingResponse: ResponseContent = {
  text: "I'm analyzing the codebase and looking for",
  isStreaming: true,
  streamStartTime: now - 500,
}

const emptyStreamingResponse: ResponseContent = {
  text: '',
  isStreaming: true,
  streamStartTime: now,
}

// ============================================================================
// Component Entry
// ============================================================================

export const turnCardComponents: ComponentEntry[] = [
  {
    id: 'turn-card',
    name: 'TurnCard',
    category: 'Chat',
    description: 'Email-like batched display for one assistant turn with activities and response',
    component: TurnCard,
    wrapper: PaddedWrapper,
    layout: 'top',
    props: [
      {
        name: 'isStreaming',
        description: 'Whether content is still being received',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'isComplete',
        description: 'Whether this turn is fully complete',
        control: { type: 'boolean' },
        defaultValue: true,
      },
      {
        name: 'defaultExpanded',
        description: 'Start with activities expanded',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'intent',
        description: 'Primary intent/goal for preview text',
        control: { type: 'string', placeholder: 'e.g., Searching for auth handlers...' },
        defaultValue: '',
      },
    ],
    variants: [
      // Initial / Empty state
      {
        name: 'Initial (Starting)',
        description: 'No activities yet, just starting',
        props: {
          activities: [],
          response: undefined,
          isStreaming: true,
          isComplete: false,
        },
      },
      // Single tool running
      {
        name: 'Single Tool Running',
        description: 'One tool currently executing',
        props: {
          activities: [runningGrepActivity],
          response: undefined,
          isStreaming: true,
          isComplete: false,
          intent: 'Finding error handling patterns',
        },
      },
      // Multiple tools running
      {
        name: 'Multiple Tools Running',
        description: 'Several tools executing in parallel',
        props: {
          activities: [
            { ...completedGrepActivity, status: 'completed' },
            runningReadActivity,
            pendingActivity,
          ],
          response: undefined,
          isStreaming: true,
          isComplete: false,
        },
      },
      // All tools completed (collapsed)
      {
        name: 'Tools Completed (Collapsed)',
        description: 'Multiple tools finished, collapsed by default',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
          ],
          response: undefined,
          isStreaming: false,
          isComplete: false,
        },
      },
      // Tools completed, now streaming response
      {
        name: 'Streaming Response',
        description: 'Tools done, response is streaming',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
          ],
          response: streamingResponse,
          isStreaming: true,
          isComplete: false,
        },
      },
      // Waiting for response (empty streaming)
      {
        name: 'Waiting for Response',
        description: 'Tools done, waiting for response to start',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
          ],
          response: emptyStreamingResponse,
          isStreaming: true,
          isComplete: false,
        },
      },
      // Complete turn with short response
      {
        name: 'Complete (Short)',
        description: 'Finished turn with brief response',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
          ],
          response: shortResponse,
          isStreaming: false,
          isComplete: true,
        },
      },
      // Complete turn with long response
      {
        name: 'Complete (Long)',
        description: 'Finished turn with detailed response',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
            completedBashActivity,
          ],
          response: longResponse,
          isStreaming: false,
          isComplete: true,
          intent: 'Analyzing authentication system',
        },
      },
      // Error state
      {
        name: 'Error State',
        description: 'A tool failed during execution',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            errorActivity,
          ],
          response: undefined,
          isStreaming: false,
          isComplete: false,
          defaultExpanded: true,
        },
      },
      // Response only (no tools)
      {
        name: 'Response Only',
        description: 'Direct response without tool usage',
        props: {
          activities: [],
          response: shortResponse,
          isStreaming: false,
          isComplete: true,
        },
      },
      // Many tools
      {
        name: 'Many Tools (5+)',
        description: 'Large number of completed tools',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
            completedBashActivity,
            { ...completedReadActivity1, id: 'tool-5', toolInput: { file_path: '/src/config.ts' } },
            { ...completedReadActivity1, id: 'tool-6', toolInput: { file_path: '/src/utils.ts' } },
          ],
          response: shortResponse,
          isStreaming: false,
          isComplete: true,
        },
      },
      // Expanded by default
      {
        name: 'Expanded (Default)',
        description: 'Activities shown expanded initially',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
          ],
          response: shortResponse,
          isStreaming: false,
          isComplete: true,
          defaultExpanded: true,
        },
      },
      // Mixed: Tools with intermediate messages (completed)
      {
        name: 'Mixed: Tools + Commentary',
        description: 'Tools interleaved with LLM intermediate messages',
        props: {
          activities: [
            intermediateMessage1,
            completedGrepActivity,
            intermediateMessage2,
            completedReadActivity1,
            intermediateMessage3,
            completedReadActivity2,
          ],
          response: shortResponse,
          isStreaming: false,
          isComplete: true,
          defaultExpanded: true,
        },
      },
      // Mixed: In progress with commentary
      {
        name: 'Mixed: In Progress',
        description: 'Tool running after intermediate message',
        props: {
          activities: [
            intermediateMessage1,
            completedGrepActivity,
            intermediateMessage2,
            completedReadActivity1,
            intermediateMessageRunning,
            runningReadActivity,
          ],
          response: undefined,
          isStreaming: true,
          isComplete: false,
        },
      },
      // Mixed: Many steps
      {
        name: 'Mixed: Long Chain',
        description: 'Extended conversation with multiple tool/message pairs',
        props: {
          activities: [
            intermediateMessage1,
            completedGrepActivity,
            intermediateMessage2,
            completedReadActivity1,
            intermediateMessage3,
            completedReadActivity2,
            intermediateMessageRunning,
            completedBashActivity,
          ],
          response: longResponse,
          isStreaming: false,
          isComplete: true,
          defaultExpanded: true,
        },
      },
      // Mixed: Commentary only (no tools yet)
      {
        name: 'Mixed: Thinking Start',
        description: 'LLM thinking before first tool call',
        props: {
          activities: [
            intermediateMessage1,
          ],
          response: undefined,
          isStreaming: true,
          isComplete: false,
        },
      },
      // Mixed: Currently thinking (streaming intermediate)
      {
        name: 'Mixed: Currently Thinking',
        description: 'LLM is streaming an intermediate message',
        props: {
          activities: [
            intermediateMessage1,
            completedGrepActivity,
            intermediateMessage2,
            completedReadActivity1,
            intermediateMessageStreaming,
          ],
          response: undefined,
          isStreaming: true,
          isComplete: false,
          defaultExpanded: true,
        },
      },
    ],
    mockData: () => ({
      activities: [
        completedGrepActivity,
        completedReadActivity1,
        completedReadActivity2,
      ],
      response: shortResponse,
      onOpenFile: (path: string) => console.log('[Playground] Open file:', path),
      onOpenUrl: (url: string) => console.log('[Playground] Open URL:', url),
    }),
  },
  // Streaming Simulation - Live demo of streaming response
  {
    id: 'turn-card-streaming-sim',
    name: 'TurnCard (Streaming Sim)',
    category: 'Chat',
    description: 'Live simulation of document-style streaming preview with batched fade-in updates',
    component: StreamingSimulationTurnCard,
    wrapper: PaddedWrapper,
    layout: 'top',
    props: [
      {
        name: 'simulationSpeed',
        description: 'How fast to simulate streaming',
        control: {
          type: 'select',
          options: [
            { label: 'Slow', value: 'slow' },
            { label: 'Normal', value: 'normal' },
            { label: 'Fast', value: 'fast' },
          ],
        },
        defaultValue: 'normal',
      },
      {
        name: 'intent',
        description: 'Intent text shown in header',
        control: { type: 'string', placeholder: 'e.g., Analyzing auth system...' },
        defaultValue: 'Analyzing the authentication system',
      },
    ],
    variants: [
      {
        name: 'Response Only (Slow)',
        description: 'Document preview with gradient and toggle - slow to observe cross-fade',
        props: {
          activities: [],
          simulationSpeed: 'slow',
        },
      },
      {
        name: 'After Tools (Normal)',
        description: 'Shows last few lines in large card with batched updates',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
            completedReadActivity2,
          ],
          simulationSpeed: 'normal',
          intent: 'Analyzing authentication handlers',
        },
      },
      {
        name: 'Long Content (Slow)',
        description: 'Best for observing gradient at top and cross-fade effect',
        props: {
          activities: [
            completedGrepActivity,
            completedReadActivity1,
          ],
          simulationSpeed: 'slow',
        },
      },
      {
        name: 'After Mixed (Fast)',
        description: 'Fast streaming after tools + commentary',
        props: {
          activities: [
            intermediateMessage1,
            completedGrepActivity,
            intermediateMessage2,
            completedReadActivity1,
          ],
          simulationSpeed: 'fast',
          intent: 'Searching for patterns',
        },
      },
    ],
    mockData: () => ({
      activities: [
        completedGrepActivity,
        completedReadActivity1,
      ],
    }),
  },
]
