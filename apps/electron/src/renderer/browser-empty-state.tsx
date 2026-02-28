import React, { useCallback } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserEmptyStateCard } from '@craft-agent/ui'
import { routes } from '../shared/routes'
import { EMPTY_STATE_PROMPT_SAMPLES } from './components/browser/empty-state-prompts'
import './index.css'

function BrowserEmptyStateApp() {
  const handlePromptSelect = useCallback((fullPrompt: string) => {
    const route = routes.action.newSession({ input: fullPrompt, send: true })
    const launchParams = new URLSearchParams({ route, ts: String(Date.now()) })

    // Signal main process through hash navigation (reliable in BrowserView).
    // BrowserPaneManager listens for #launch=... and performs deep-link routing.
    window.location.hash = `launch=${launchParams.toString()}`
  }, [])

  return (
    <div className="h-screen w-screen bg-foreground-2 overflow-hidden">
      <div className="h-full w-full bg-background overflow-auto">
        <BrowserEmptyStateCard
          title="This browser is ready for your Agents - and you ;)"
          description="Ask any session to use this browser (or open another one) to complete tasks like research, form filling, QA checks, or data extraction."
          prompts={EMPTY_STATE_PROMPT_SAMPLES}
          showExamplePrompts={true}
          showSafetyHint={true}
          onPromptSelect={(sample) => handlePromptSelect(sample.full)}
        />
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserEmptyStateApp />
  </React.StrictMode>,
)
