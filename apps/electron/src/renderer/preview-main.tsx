import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext'
import { UnifiedPreviewApp } from './components/preview/UnifiedPreviewApp'
import { Toaster } from '@/components/ui/sonner'
import './index.css'

// Parse URL params to get sessionId and previewId
const params = new URLSearchParams(window.location.search)
const sessionId = params.get('sessionId') || ''
const previewId = params.get('previewId') || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <UnifiedPreviewApp sessionId={sessionId} previewId={previewId} />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
