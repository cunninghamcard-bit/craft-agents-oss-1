import { Button } from "@/components/ui/button"

export type BannerState = 'hidden' | 'setup' | 'auth'

interface SetupAuthBannerProps {
  state: BannerState
  agentName?: string
  reason?: string
  onAction: () => void
}

/**
 * SetupAuthBanner - Shows when an agent needs setup or authentication
 *
 * States:
 * - 'setup': Agent has never been configured (needs initial setup)
 * - 'auth': Agent exists but needs re-authentication
 * - 'hidden': No banner shown
 */
export function SetupAuthBanner({
  state,
  agentName,
  reason,
  onAction
}: SetupAuthBannerProps) {
  if (state === 'hidden') return null

  const isSetup = state === 'setup'

  // Default descriptions when no reason provided
  const defaultDescription = isSetup
    ? "Set up this agent to start chatting."
    : "Re-authenticate to continue using this agent."

  return (
    <div className="px-3 py-3">
      <div className="rounded-lg border border-foreground/10 bg-card p-5 text-center">
        {/* Title */}
        <h3 className="text-sm font-semibold text-foreground font-sans">
          {isSetup ? 'Agent needs setup' : 'Authentication required'}
        </h3>

        {/* Description */}
        <p className="mt-2 text-xs text-muted-foreground">
          {reason || defaultDescription}
        </p>

        {/* Action Button */}
        <Button
          onClick={onAction}
          className="mt-4 w-full text-sm rounded-lg bg-foreground/5 text-foregdound hover:bg-foreground/10"
        >
          {isSetup ? 'Set Up Agent' : 'Authenticate'}
        </Button>
      </div>
    </div>
  )
}
