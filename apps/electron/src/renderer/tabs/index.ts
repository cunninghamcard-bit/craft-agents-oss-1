/**
 * Tab System Public Exports
 */

// Types
export type {
  TabType,
  TabBase,
  Tab,
  ChatTab,
  SettingsTab,
  ShortcutsTab,
  AgentInfoTab,
  FileTab,
  BrowserTab,
  TabState,
  OpenChatTabOptions,
} from './types'

// Hook
export { useTabs } from './useTabs'

// Components
export { TabContent } from './TabContent'
export { TabContainer } from './TabContainer'
