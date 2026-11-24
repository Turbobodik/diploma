type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveConfiguredLevel(): LogLevel {
  const raw = (import.meta.env.VITE_LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[resolveConfiguredLevel()];
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>): void {
    if (shouldEmit('debug')) {
      console.debug(`[FactMap] ${message}`, context ?? '');
    }
  },
  info(message: string, context?: Record<string, unknown>): void {
    if (shouldEmit('info')) {
      console.info(`[FactMap] ${message}`, context ?? '');
    }
  },
  warn(message: string, context?: Record<string, unknown>): void {
    if (shouldEmit('warn')) {
      console.warn(`[FactMap] ${message}`, context ?? '');
    }
  },
  error(message: string, context?: Record<string, unknown>): void {
    if (shouldEmit('error')) {
      console.error(`[FactMap] ${message}`, context ?? '');
    }
  },
};
