import { Shield, Check, X, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import type { PermissionRequest } from '../../../shared/types'

interface PermissionBannerProps {
  request: PermissionRequest
  onRespond: (allowed: boolean, alwaysAllow: boolean) => void
}

/**
 * PermissionBanner - Shows when agent needs approval for a bash command
 * Replaces the input field with command preview and approval buttons
 * Uses same container styling as input field (rounded-[8px] shadow-middle bg-background)
 */
export function PermissionBanner({ request, onRespond }: PermissionBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 30,
        mass: 0.8,
      }}
      className="rounded-[8px] bg-amber-500/5 border border-amber-500/15 shadow-middle overflow-hidden"
    >
      <div className="p-4 space-y-3">
        {/* Header with shield icon */}
        <div className="flex items-start gap-3">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 25,
              delay: 0.1,
            }}
            className="shrink-0 mt-0.5"
          >
            <Shield className="h-5 w-5 text-amber-500" />
          </motion.div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Permission Required</span>
              <span className="text-xs text-muted-foreground">({request.toolName})</span>
            </div>
            <p className="text-xs text-muted-foreground">{request.description}</p>
          </div>
        </div>

        {/* Command preview */}
        <div className="bg-foreground/5 rounded-md p-3 font-mono text-xs text-foreground/90 whitespace-pre-wrap break-all">
          {request.command}
        </div>
      </div>

      {/* Action buttons - bottom bar matching input field footer */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border/50">
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.15 }}
        >
          <Button
            size="sm"
            variant="default"
            className="h-7 gap-1.5"
            onClick={() => onRespond(true, false)}
          >
            <Check className="h-3.5 w-3.5" />
            Allow
          </Button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.2 }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 border border-foreground/10 hover:bg-foreground/5 active:bg-foreground/10"
            onClick={() => onRespond(true, true)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Always Allow
          </Button>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30, delay: 0.25 }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-red-600 dark:text-red-400 hover:text-red-600 dark:hover:text-red-400 border border-dashed border-red-500/50 hover:bg-red-500/10 hover:border-red-500/70 active:bg-red-500/20"
            onClick={() => onRespond(false, false)}
          >
            <X className="h-3.5 w-3.5" />
            Deny
          </Button>
        </motion.div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Tip text on the right */}
        <span className="text-[10px] text-muted-foreground">
          "Always Allow" remembers this command for the session
        </span>
      </div>
    </motion.div>
  )
}
