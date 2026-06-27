/**
 * Structured Logging System
 * 
 * Provides filterable, level-based logging to replace scattered console.log statements.
 * 
 * Usage:
 *   import { log } from '@/lib/utils/logger';
 *   log.debug('Chat', 'User action', { userId: '123' });
 *   log.error('API', 'Request failed', { error });
 * 
 * Runtime Configuration (in browser console):
 *   localStorage.setItem('logger_config', JSON.stringify({
 *     level: 0,              // ERROR only
 *     enabledModules: ['Chat', 'API']
 *   }));
 *   location.reload();
 */

// Log levels (ordered by severity)
export enum LogLevel {
  ERROR = 0,   // Critical errors only
  WARN = 1,    // Warnings and errors
  INFO = 2,    // General information (default for production)
  DEBUG = 3,   // Detailed debugging (default for development)
  TRACE = 4    // Ultra-verbose (render cycles, etc.)
}

// Module names for filtering
export type LogModule =
  | 'Chat'
  | 'API'
  | 'Settings'
  | 'GraphRAG'
  | 'Research'
  | 'Auth'
  | 'Training'
  | 'BatchTesting'
  | 'Export'
  | 'TTS'
  | 'STT'
  | 'Models'
  | 'Supabase'
  | 'Widget'
  | 'System'
  | 'Validation'
  | 'useChat'
  | 'useChatContext'
  | 'useContextTracking'
  | 'useConversationActions'
  | 'useConversationState'
  | 'useConversations'
  | 'useMessages'
  | 'useModelSelection'
  | 'useSettings'
  | 'useTools';

interface LoggerConfig {
  level: LogLevel;
  enabledModules: LogModule[] | 'all';
  enableTimestamp: boolean;
  enableStackTrace: boolean;      // Capture stack traces for errors
  enablePerformance: boolean;     // Track performance metrics
  enableBrowserInfo: boolean;     // Capture browser/user agent info
  persistLogs: boolean;          // Store logs in localStorage for debugging
  maxStoredLogs: number;         // Max logs to persist
}

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  data?: unknown;
  stackTrace?: string;
  userAgent?: string;
  url?: string;
  sessionId?: string;
  performanceNow?: number;
  callCount?: number;        // Track repeated calls
  frameId?: number;          // Track animation frames
}

interface CallTracker {
  lastCall: number;
  count: number;
  locations: string[];
}

// Generate session ID for tracking logs across page loads
const SESSION_ID = typeof window !== 'undefined' 
  ? `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  : 'server';

class Logger {
  private config: LoggerConfig;
  private logHistory: LogEntry[] = [];
  private callTrackers = new Map<string, CallTracker>();
  private renderFrameCount = 0;
  private loopDetectionThreshold = 50; // Warn if same log appears 50+ times in 1 second

  constructor() {
    // Default config based on environment
    const isDev = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
    
    this.config = {
      level: isDev ? LogLevel.DEBUG : LogLevel.INFO,
      enabledModules: 'all',
      enableTimestamp: true,          // Enable by default for better debugging
      enableStackTrace: true,          // Capture stack traces for errors
      enablePerformance: true,         // Track performance metrics
      enableBrowserInfo: true,         // Capture browser context
      persistLogs: isDev,              // Persist in dev mode
      maxStoredLogs: 1000,            // Keep last 1000 logs
    };

    // Allow runtime configuration via localStorage (browser only)
    if (typeof window !== 'undefined') {
      this.loadBrowserConfig();
      this.loadPersistedLogs();
    }
  }

  private shouldPrintStackTrace(): boolean {
    if (!this.config.enableStackTrace) return false;
    try {
      // In production builds, avoid noisy stack traces in console
      if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
        return false;
      }
    } catch { /* noop */ }
    return true;
  }

  private loadBrowserConfig(): void {
    try {
      const stored = localStorage.getItem('logger_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = { ...this.config, ...parsed };
      }
    } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Silently fail - don't break app if localStorage issues
    }
  }

  private loadPersistedLogs(): void {
    if (!this.config.persistLogs) return;
    
    try {
      const stored = localStorage.getItem('logger_history');
      if (stored) {
        this.logHistory = JSON.parse(stored);
      }
    } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // Silently fail
    }
  }

  private persistLog(entry: LogEntry): void {
    if (!this.config.persistLogs || typeof window === 'undefined') return;
    
    this.logHistory.push(entry);
    
    // Keep only the most recent logs
    if (this.logHistory.length > this.config.maxStoredLogs) {
      this.logHistory = this.logHistory.slice(-this.config.maxStoredLogs);
    }
    
    try {
      localStorage.setItem('logger_history', JSON.stringify(this.logHistory));
    } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
      // If storage is full, clear old logs and try again
      this.logHistory = this.logHistory.slice(-100);
      try {
        localStorage.setItem('logger_history', JSON.stringify(this.logHistory));
      } catch (_e2) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Give up
      }
    }
  }

  private captureStackTrace(): string | undefined {
    if (!this.config.enableStackTrace) return undefined;
    
    try {
      const stack = new Error().stack;
      if (!stack) return undefined;
      
      // Remove the first 3 lines (Error, this method, and the log method)
      const lines = stack.split('\n').slice(3);
      return lines.join('\n');
    } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
      return undefined;
    }
  }

  private getBrowserInfo(): { userAgent?: string; url?: string } {
    if (!this.config.enableBrowserInfo || typeof window === 'undefined') {
      return {};
    }
    
    return {
      userAgent: navigator.userAgent,
      url: window.location.href,
    };
  }

  private detectLoop(module: LogModule, message: string): { isLoop: boolean; callCount: number } {
    const key = `${module}:${message}`;
    const now = Date.now();
    
    let tracker = this.callTrackers.get(key);
    if (!tracker) {
      tracker = { lastCall: now, count: 1, locations: [] };
      this.callTrackers.set(key, tracker);
      return { isLoop: false, callCount: 1 };
    }
    
    // Reset counter if more than 1 second has passed
    if (now - tracker.lastCall > 1000) {
      tracker.count = 1;
      tracker.lastCall = now;
      return { isLoop: false, callCount: 1 };
    }
    
    // Increment counter
    tracker.count++;
    tracker.lastCall = now;
    
    // Check if we're in a loop
    const isLoop = tracker.count >= this.loopDetectionThreshold;
    
    if (isLoop && tracker.count === this.loopDetectionThreshold) {
      // Only warn once when threshold is hit
      console.error(
        `🔁 INFINITE LOOP DETECTED! [${module}] "${message}" called ${tracker.count} times in 1 second`,
        '\nStack trace:',
        new Error().stack
      );
    }
    
    return { isLoop, callCount: tracker.count };
  }

  private createLogEntry(
    level: LogLevel,
    module: LogModule,
    message: string,
    data?: unknown,
    includeStack = false
  ): LogEntry {
    // Detect infinite loops
    const loopCheck = this.detectLoop(module, message);
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      module,
      message,
      sessionId: SESSION_ID,
      callCount: loopCheck.callCount,
    };

    if (data !== undefined) {
      entry.data = data;
    }

    if (this.config.enablePerformance && typeof performance !== 'undefined') {
      entry.performanceNow = performance.now();
      entry.frameId = this.renderFrameCount;
    }

    if (includeStack || level === LogLevel.ERROR || loopCheck.isLoop) {
      entry.stackTrace = this.captureStackTrace();
    }

    const browserInfo = this.getBrowserInfo();
    if (browserInfo.userAgent) entry.userAgent = browserInfo.userAgent;
    if (browserInfo.url) entry.url = browserInfo.url;

    // Add loop warning to message if detected
    if (loopCheck.isLoop && loopCheck.callCount > this.loopDetectionThreshold) {
      entry.message = `⚠️ LOOP (${loopCheck.callCount}x) ${message}`;
    }

    return entry;
  }

  private shouldLog(level: LogLevel, module: LogModule): boolean {
    // Check level threshold
    if (level > this.config.level) return false;
    
    // Check module filter
    if (this.config.enabledModules !== 'all') {
      if (!this.config.enabledModules.includes(module)) return false;
    }
    
    return true;
  }

  private formatMessage(
    level: LogLevel,
    module: LogModule,
    message: string
  ): string {
    const parts: string[] = [];
    
    // Timestamp (optional)
    if (this.config.enableTimestamp) {
      parts.push(new Date().toISOString());
    }
    
    // Level
    parts.push(`[${LogLevel[level]}]`);
    
    // Module
    parts.push(`[${module}]`);
    
    // Message
    parts.push(message);
    
    return parts.join(' ');
  }

  error(module: LogModule, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.ERROR, module)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, module, message, data, true);
    const formatted = this.formatMessage(LogLevel.ERROR, module, message);
    
    if (data !== undefined) {
      console.error(formatted, data);
      if (entry.stackTrace && this.shouldPrintStackTrace()) {
        console.error('Stack trace:', entry.stackTrace);
      }
    } else {
      console.error(formatted);
      if (entry.stackTrace && this.shouldPrintStackTrace()) {
        console.error('Stack trace:', entry.stackTrace);
      }
    }
    
    this.persistLog(entry);
  }

  warn(module: LogModule, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.WARN, module)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, module, message, data);
    const formatted = this.formatMessage(LogLevel.WARN, module, message);
    
    if (data !== undefined) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }
    
    this.persistLog(entry);
  }

  info(module: LogModule, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.INFO, module)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, module, message, data);
    const formatted = this.formatMessage(LogLevel.INFO, module, message);
    
    if (data !== undefined) {
      console.info(formatted, data);
    } else {
      console.info(formatted);
    }
    
    this.persistLog(entry);
  }

  debug(module: LogModule, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.DEBUG, module)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, module, message, data);
    const formatted = this.formatMessage(LogLevel.DEBUG, module, message);
    
    if (data !== undefined) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
    
    this.persistLog(entry);
  }

  trace(module: LogModule, message: string, data?: unknown): void {
    if (!this.shouldLog(LogLevel.TRACE, module)) return;
    
    const entry = this.createLogEntry(LogLevel.TRACE, module, message, data);
    const formatted = this.formatMessage(LogLevel.TRACE, module, message);
    
    if (data !== undefined) {
      console.log(formatted, data);
    } else {
      console.log(formatted);
    }
    
    this.persistLog(entry);
  }

  // Runtime configuration helpers
  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.saveBrowserConfig();
  }

  setModules(modules: LogModule[] | 'all'): void {
    this.config.enabledModules = modules;
    this.saveBrowserConfig();
  }

  enableTimestamps(enable: boolean): void {
    this.config.enableTimestamp = enable;
    this.saveBrowserConfig();
  }

  enableStackTraces(enable: boolean): void {
    this.config.enableStackTrace = enable;
    this.saveBrowserConfig();
  }

  enablePerformance(enable: boolean): void {
    this.config.enablePerformance = enable;
    this.saveBrowserConfig();
  }

  enablePersistence(enable: boolean): void {
    this.config.persistLogs = enable;
    this.saveBrowserConfig();
  }

  getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }

  // Get log history
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  // Get filtered logs
  getErrorLogs(): LogEntry[] {
    return this.logHistory.filter(entry => entry.level === 'ERROR');
  }

  getLogsByModule(module: LogModule): LogEntry[] {
    return this.logHistory.filter(entry => entry.module === module);
  }

  // Export logs as JSON for bug reports
  exportLogs(): string {
    return JSON.stringify({
      sessionId: SESSION_ID,
      exportedAt: new Date().toISOString(),
      config: this.config,
      logs: this.logHistory,
      browserInfo: this.getBrowserInfo(),
    }, null, 2);
  }

  // Download logs as a file
  downloadLogs(filename = 'app-logs.json'): void {
    if (typeof window === 'undefined') return;
    
    const content = this.exportLogs();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Clear log history
  clearHistory(): void {
    this.logHistory = [];
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('logger_history');
      } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Silently fail
      }
    }
  }

  // Get summary statistics
  getStats(): {
    total: number;
    byLevel: Record<string, number>;
    byModule: Record<string, number>;
    errorRate: number;
    loopWarnings: number;
  } {
    const stats = {
      total: this.logHistory.length,
      byLevel: {} as Record<string, number>,
      byModule: {} as Record<string, number>,
      errorRate: 0,
      loopWarnings: 0,
    };

    this.logHistory.forEach(entry => {
      stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;
      stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1;
      if (entry.message.includes('LOOP')) {
        stats.loopWarnings++;
      }
    });

    const errorCount = stats.byLevel['ERROR'] || 0;
    stats.errorRate = stats.total > 0 ? (errorCount / stats.total) * 100 : 0;

    return stats;
  }

  // Detect potential infinite loops
  getLoopDiagnostics(): Array<{ key: string; callCount: number; lastCall: number }> {
    const diagnostics: Array<{ key: string; callCount: number; lastCall: number }> = [];
    
    this.callTrackers.forEach((tracker, key) => {
      if (tracker.count > 10) { // Report anything called more than 10 times per second
        diagnostics.push({
          key,
          callCount: tracker.count,
          lastCall: tracker.lastCall,
        });
      }
    });
    
    return diagnostics.sort((a, b) => b.callCount - a.callCount);
  }

  // Track render frames (call this in useEffect)
  trackRenderFrame(): void {
    this.renderFrameCount++;
  }

  // Reset loop detection counters
  resetLoopDetection(): void {
    this.callTrackers.clear();
  }

  // Set custom loop detection threshold
  setLoopThreshold(threshold: number): void {
    this.loopDetectionThreshold = threshold;
  }

  private saveBrowserConfig(): void {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('logger_config', JSON.stringify(this.config));
      } catch (_e) { // eslint-disable-line @typescript-eslint/no-unused-vars
        // Silently fail
      }
    }
  }
}

// Export singleton instance
export const logger = new Logger();

// Extend Window interface for TypeScript
interface WindowWithLogger extends Window {
  __logger?: {
    getLoopDiagnostics: () => Array<{ key: string; callCount: number; lastCall: number }>;
    getStats: () => ReturnType<typeof logger.getStats>;
    getHistory: () => LogEntry[];
    getErrorLogs: () => LogEntry[];
    getLogsByModule: (module: LogModule) => LogEntry[];
    exportLogs: () => string;
    downloadLogs: (filename?: string) => void;
    clearHistory: () => void;
    resetLoopDetection: () => void;
    setLoopThreshold: (threshold: number) => void;
    setLevel: (level: LogLevel) => void;
    onlyErrors: () => void;
    developmentMode: () => void;
    help: () => void;
  };
}

declare const window: WindowWithLogger;

// Expose logger globally for browser console debugging
if (typeof window !== 'undefined') {
  window.__logger = {
    getLoopDiagnostics: () => logger.getLoopDiagnostics(),
    getStats: () => logger.getStats(),
    getHistory: () => logger.getHistory(),
    getErrorLogs: () => logger.getErrorLogs(),
    getLogsByModule: (module: LogModule) => logger.getLogsByModule(module),
    exportLogs: () => logger.exportLogs(),
    downloadLogs: (filename?: string) => logger.downloadLogs(filename),
    clearHistory: () => logger.clearHistory(),
    resetLoopDetection: () => logger.resetLoopDetection(),
    setLoopThreshold: (threshold: number) => logger.setLoopThreshold(threshold),
    setLevel: (level: LogLevel) => logger.setLevel(level),
    onlyErrors: () => logger.setLevel(LogLevel.ERROR),
    developmentMode: () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.setModules('all');
      logger.enableStackTraces(true);
      logger.enablePersistence(true);
    },
    help: () => {
      console.log(`
🔍 LOGGER DIAGNOSTICS - Browser Console Commands
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Check for Loops:
  __logger.getLoopDiagnostics()

📈 View Statistics:
  __logger.getStats()

🐛 Get Error Logs:
  __logger.getErrorLogs()

💾 Download Report:
  __logger.downloadLogs('bug-report.json')

🔧 Settings:
  __logger.onlyErrors()           // Show only errors
  __logger.developmentMode()       // Full debug mode
  __logger.setLoopThreshold(20)    // Change loop sensitivity

🧹 Cleanup:
  __logger.clearHistory()          // Clear all logs
  __logger.resetLoopDetection()    // Reset loop counters

❓ Show Help:
  __logger.help()
      `);
    }
  };
  
  // Show help on first load
  console.log('🔍 Logger diagnostics available! Type __logger.help() for commands');
}

// Export convenience functions for easier usage
export const log = {
  error: (module: LogModule, msg: string, data?: unknown) => logger.error(module, msg, data),
  warn: (module: LogModule, msg: string, data?: unknown) => logger.warn(module, msg, data),
  info: (module: LogModule, msg: string, data?: unknown) => logger.info(module, msg, data),
  debug: (module: LogModule, msg: string, data?: unknown) => logger.debug(module, msg, data),
  trace: (module: LogModule, msg: string, data?: unknown) => logger.trace(module, msg, data),
};

// Export helper functions for runtime configuration
export const configureLogger = {
  setLevel: (level: LogLevel) => logger.setLevel(level),
  setModules: (modules: LogModule[] | 'all') => logger.setModules(modules),
  enableTimestamps: (enable: boolean) => logger.enableTimestamps(enable),
  enableStackTraces: (enable: boolean) => logger.enableStackTraces(enable),
  enablePerformance: (enable: boolean) => logger.enablePerformance(enable),
  enablePersistence: (enable: boolean) => logger.enablePersistence(enable),
  getConfig: () => logger.getConfig(),
  
  // Convenience presets
  onlyErrors: () => logger.setLevel(LogLevel.ERROR),
  productionMode: () => {
    logger.setLevel(LogLevel.INFO);
    logger.setModules('all');
    logger.enableStackTraces(true);
    logger.enablePersistence(true);
  },
  developmentMode: () => {
    logger.setLevel(LogLevel.DEBUG);
    logger.setModules('all');
    logger.enableStackTraces(true);
    logger.enablePersistence(true);
  },
  verboseMode: () => {
    logger.setLevel(LogLevel.TRACE);
    logger.enableTimestamps(true);
    logger.enableStackTraces(true);
    logger.enablePerformance(true);
  },
  
  // Diagnostic helpers
  getHistory: () => logger.getHistory(),
  getErrorLogs: () => logger.getErrorLogs(),
  getLogsByModule: (module: LogModule) => logger.getLogsByModule(module),
  getStats: () => logger.getStats(),
  exportLogs: () => logger.exportLogs(),
  downloadLogs: (filename?: string) => logger.downloadLogs(filename),
  clearHistory: () => logger.clearHistory(),
  
  // Loop detection helpers
  getLoopDiagnostics: () => logger.getLoopDiagnostics(),
  resetLoopDetection: () => logger.resetLoopDetection(),
  setLoopThreshold: (threshold: number) => logger.setLoopThreshold(threshold),
  trackRenderFrame: () => logger.trackRenderFrame(),
};

// Export types for use in other modules
export type { LogEntry };




