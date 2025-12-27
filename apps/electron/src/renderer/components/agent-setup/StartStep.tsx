import { StepFormLayout, ContinueButton, BackButton } from "@/components/onboarding/primitives"

interface StartStepProps {
  /** Name of the agent */
  agentName: string
  /** Called when user clicks to start setup */
  onStart?: () => void
  /** Called when user cancels */
  onCancel?: () => void
}

/**
 * StartStep - Initial screen before agent activation begins
 *
 * Shows agent name and a button to start the setup process.
 * User must explicitly click to begin activation.
 */
export function StartStep({
  agentName,
  onStart,
  onCancel,
}: StartStepProps) {
  return (
    <StepFormLayout
      title={`Activate ${agentName}`}
      description="This will read the agent's configuration from Craft and set up any required sources."
      actions={
        <>
          {onCancel && (
            <BackButton onClick={onCancel}>Cancel</BackButton>
          )}
          <ContinueButton onClick={onStart}>
            Activate Agent
          </ContinueButton>
        </>
      }
    />
  )
}
