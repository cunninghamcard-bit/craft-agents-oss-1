import type { ComponentEntry } from './types'
import { AttachmentPreview } from '@/components/chat/AttachmentPreview'
import { PermissionBanner } from '@/components/chat/PermissionBanner'
import { SetupAuthBanner } from '@/components/chat/SetupAuthBanner'
import type { FileAttachment, PermissionRequest } from '../../../shared/types'

// Sample file attachments for testing
const sampleImageAttachment: FileAttachment = {
  type: 'image',
  path: '/Users/test/screenshot.png',
  name: 'screenshot.png',
  mimeType: 'image/png',
  size: 245000,
  base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
}

const samplePdfAttachment: FileAttachment = {
  type: 'pdf',
  path: '/Users/test/report.pdf',
  name: 'quarterly-report-2024.pdf',
  mimeType: 'application/pdf',
  size: 1024000,
}

const sampleCodeAttachment: FileAttachment = {
  type: 'text',
  path: '/Users/test/app.tsx',
  name: 'App.tsx',
  mimeType: 'text/typescript',
  size: 8500,
}

const samplePermissionRequest: PermissionRequest = {
  requestId: 'perm-1',
  sessionId: 'session-1',
  toolName: 'bash',
  description: 'Run shell command',
  command: 'npm install --save-dev typescript @types/react',
}

const longPermissionRequest: PermissionRequest = {
  requestId: 'perm-2',
  sessionId: 'session-1',
  toolName: 'bash',
  description: 'Run shell command',
  command: 'find /Users/test/project -type f -name "*.ts" | xargs grep -l "deprecated" | head -20',
}

export const chatComponents: ComponentEntry[] = [
  {
    id: 'attachment-preview',
    name: 'AttachmentPreview',
    category: 'Chat',
    description: 'ChatGPT-style attachment preview strip showing attached files as bubbles above textarea',
    component: AttachmentPreview,
    props: [
      {
        name: 'disabled',
        description: 'Disable remove buttons',
        control: { type: 'boolean' },
        defaultValue: false,
      },
      {
        name: 'loadingCount',
        description: 'Number of loading placeholders to show',
        control: { type: 'number', min: 0, max: 5, step: 1 },
        defaultValue: 0,
      },
    ],
    variants: [
      { name: 'Empty', props: { attachments: [], loadingCount: 0 } },
      { name: 'With Images', props: { attachments: [sampleImageAttachment, sampleImageAttachment] } },
      { name: 'With Documents', props: { attachments: [samplePdfAttachment, sampleCodeAttachment] } },
      { name: 'Mixed', props: { attachments: [sampleImageAttachment, samplePdfAttachment, sampleCodeAttachment] } },
      { name: 'Loading', props: { attachments: [], loadingCount: 3 } },
      { name: 'Disabled', props: { attachments: [sampleImageAttachment, samplePdfAttachment], disabled: true } },
    ],
    mockData: () => ({
      attachments: [sampleImageAttachment, samplePdfAttachment],
      onRemove: (index: number) => console.log('[Playground] Remove attachment:', index),
    }),
  },
  {
    id: 'permission-banner',
    name: 'PermissionBanner',
    category: 'Chat',
    description: 'Shows when agent needs approval for a bash command with Allow/Always Allow/Deny options',
    component: PermissionBanner,
    props: [],
    variants: [
      { name: 'Default', props: { request: samplePermissionRequest } },
      { name: 'Long Command', props: { request: longPermissionRequest } },
    ],
    mockData: () => ({
      request: samplePermissionRequest,
      onRespond: (allowed: boolean, alwaysAllow: boolean) => {
        console.log('[Playground] Permission response:', { allowed, alwaysAllow })
      },
    }),
  },
  {
    id: 'setup-auth-banner',
    name: 'SetupAuthBanner',
    category: 'Chat',
    description: 'Shows when an agent needs setup or authentication',
    component: SetupAuthBanner,
    props: [
      {
        name: 'state',
        description: 'Banner state',
        control: {
          type: 'select',
          options: [
            { label: 'Hidden', value: 'hidden' },
            { label: 'Setup', value: 'setup' },
            { label: 'Auth', value: 'auth' },
          ],
        },
        defaultValue: 'setup',
      },
      {
        name: 'agentName',
        description: 'Name of the agent',
        control: { type: 'string', placeholder: 'Agent name' },
        defaultValue: 'GitHub Copilot',
      },
      {
        name: 'reason',
        description: 'Custom reason message',
        control: { type: 'string', placeholder: 'Optional custom reason' },
        defaultValue: '',
      },
    ],
    variants: [
      { name: 'Setup Needed', props: { state: 'setup', agentName: 'GitHub Copilot' } },
      { name: 'Auth Needed', props: { state: 'auth', agentName: 'Linear' } },
      { name: 'Custom Reason', props: { state: 'auth', agentName: 'Slack', reason: 'Your OAuth token has expired. Please re-authenticate to continue.' } },
      { name: 'Hidden', props: { state: 'hidden' } },
    ],
    mockData: () => ({
      onAction: () => console.log('[Playground] Setup/Auth action clicked'),
    }),
  },
]
