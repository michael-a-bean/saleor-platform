/**
 * Structured logging utility for the storefront.
 *
 * Provides consistent logging with context (component, action) and
 * JSON serialization in production for log aggregation systems.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *
 *   logger.info("search", "query executed", { query: "dragon", results: 42 });
 *   logger.error("checkout", "payment failed", { error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
	[key: string]: unknown;
}

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	component: string;
	message: string;
	context?: LogContext;
}

const isDevelopment = process.env.NODE_ENV === "development";
const isServer = typeof window === "undefined";

/**
 * Format log entry for output.
 * In development: human-readable format.
 * In production: JSON for log aggregation.
 */
function formatLogEntry(entry: LogEntry): string {
	if (isDevelopment) {
		const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
		return `[${entry.level.toUpperCase()}] [${entry.component}] ${entry.message}${contextStr}`;
	}

	// Production: JSON format for log aggregation
	return JSON.stringify(entry);
}

/**
 * Create a log entry with timestamp and metadata.
 */
function createLogEntry(
	level: LogLevel,
	component: string,
	message: string,
	context?: LogContext,
): LogEntry {
	return {
		timestamp: new Date().toISOString(),
		level,
		component,
		message,
		...(context && Object.keys(context).length > 0 ? { context } : {}),
	};
}

/**
 * Determine if we should log at this level.
 * In development, log everything.
 * In production, log info and above.
 */
function shouldLog(level: LogLevel): boolean {
	if (isDevelopment) return true;

	const levels: LogLevel[] = ["debug", "info", "warn", "error"];
	const minLevel = "info"; // Production minimum
	return levels.indexOf(level) >= levels.indexOf(minLevel);
}

/**
 * Main logging function.
 */
function log(level: LogLevel, component: string, message: string, context?: LogContext): void {
	if (!shouldLog(level)) return;

	const entry = createLogEntry(level, component, message, context);
	const formatted = formatLogEntry(entry);

	// Use appropriate console method
	switch (level) {
		case "debug":
			console.debug(formatted);
			break;
		case "info":
			console.info(formatted);
			break;
		case "warn":
			console.warn(formatted);
			break;
		case "error":
			console.error(formatted);
			break;
	}
}

/**
 * Logger interface with methods for each log level.
 */
export const logger = {
	/**
	 * Debug-level logging (development only).
	 * Use for detailed debugging information.
	 */
	debug: (component: string, message: string, context?: LogContext) =>
		log("debug", component, message, context),

	/**
	 * Info-level logging.
	 * Use for general operational information.
	 */
	info: (component: string, message: string, context?: LogContext) =>
		log("info", component, message, context),

	/**
	 * Warning-level logging.
	 * Use for recoverable issues or deprecated usage.
	 */
	warn: (component: string, message: string, context?: LogContext) =>
		log("warn", component, message, context),

	/**
	 * Error-level logging.
	 * Use for errors that affect functionality.
	 */
	error: (component: string, message: string, context?: LogContext) =>
		log("error", component, message, context),

	/**
	 * Create a scoped logger for a specific component.
	 * Reduces boilerplate when logging from the same component multiple times.
	 *
	 * Usage:
	 *   const log = logger.scope("meilisearch");
	 *   log.info("search started", { query });
	 *   log.error("search failed", { error: err.message });
	 */
	scope: (component: string) => ({
		debug: (message: string, context?: LogContext) => log("debug", component, message, context),
		info: (message: string, context?: LogContext) => log("info", component, message, context),
		warn: (message: string, context?: LogContext) => log("warn", component, message, context),
		error: (message: string, context?: LogContext) => log("error", component, message, context),
	}),

	/**
	 * Check if running on server (for conditional logging).
	 */
	isServer,
};

export default logger;
