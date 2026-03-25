type LogMeta = Record<string, unknown>

export function logInfo(scope: string, message: string, meta?: LogMeta) {
  console.log(`[${scope}] ${message}`, meta ?? {})
}

export function logError(scope: string, message: string, meta?: LogMeta) {
  console.error(`[${scope}] ${message}`, meta ?? {})
}
