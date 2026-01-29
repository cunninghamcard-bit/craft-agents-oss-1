/// <reference types="vite/client" />

// Asset module declarations for TypeScript
// Vite handles these imports at build time, but TS needs type info
declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
