import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider as JotaiProvider } from 'jotai'
import { ThemeProvider } from './context/ThemeContext'
import { PlaygroundApp } from './playground/PlaygroundApp'
import './index.css'

// Playground always uses mock API (runs in browser without Electron)
console.log('[Playground] Loading mock API...')
import('./mocks/electronAPI').then(({ mockElectronAPI }) => {
  window.electronAPI = mockElectronAPI
  console.log('[Playground] Mock API loaded, rendering app')
  renderApp()
})

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <JotaiProvider>
        <ThemeProvider>
          <PlaygroundApp />
        </ThemeProvider>
      </JotaiProvider>
    </React.StrictMode>
  )
}
