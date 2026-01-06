/**
 * Header - App header with branding and controls
 */

import { Sun, Moon, X } from 'lucide-react'

/**
 * CraftAgentLogo - The Craft Agent "C" logo
 */
function CraftAgentLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(3.4502, 3)" fill="currentColor">
        <path
          d="M3.17890888,3.6 L3.17890888,0 L16,0 L16,3.6 L3.17890888,3.6 Z M9.642,7.2 L9.64218223,10.8 L0,10.8 L0,3.6 L16,3.6 L16,7.2 L9.642,7.2 Z M3.17890888,18 L3.178,14.4 L0,14.4 L0,10.8 L16,10.8 L16,18 L3.17890888,18 Z"
          fillRule="nonzero"
        />
      </g>
    </svg>
  )
}

interface HeaderProps {
  hasSession: boolean
  isDark: boolean
  onToggleTheme: () => void
  onClear: () => void
}

export function Header({ hasSession, isDark, onToggleTheme, onClear }: HeaderProps) {
  return (
    <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-foreground/5">
      <div className="flex items-center gap-3">
        {/* Logo / Branding */}
        <div className="flex items-center gap-2">
          <CraftAgentLogo className="w-6 h-6 text-[#9570BE]" />
          <span className="font-medium text-foreground">Session Viewer</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Clear button (when session is loaded) */}
        {hasSession && (
          <button
            onClick={onClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-md
                       text-foreground/60 hover:text-foreground hover:bg-foreground/5
                       transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Clear</span>
          </button>
        )}

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-colors"
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  )
}
