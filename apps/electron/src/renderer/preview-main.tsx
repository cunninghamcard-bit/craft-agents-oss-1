import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from './context/ThemeContext'
import { PreviewApp } from './components/preview/PreviewApp'
import { Toaster } from '@/components/ui/sonner'
import './index.css'

// Parse URL params to get sessionId and messageId
const params = new URLSearchParams(window.location.search)
const sessionId = params.get('sessionId') || ''
const messageId = params.get('messageId') || ''

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PreviewApp sessionId={sessionId} messageId={messageId} />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
