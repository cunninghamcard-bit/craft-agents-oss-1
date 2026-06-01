type Logger = Pick<Console, 'debug' | 'info' | 'warn' | 'error'>

function scope(name: string): Logger {
  const prefix = `[${name}]`
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}

const log = { scope }

export const rendererLog = scope('renderer')
export const searchLog = scope('search')

export default log
