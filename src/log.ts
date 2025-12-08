import * as winston from "winston";

// Logger interface
// Compatible with winston.Logger but can be any implementation
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  // This can be null, or you can use the exported logFunctionInfo function
  // below
  logFunctionInfo(callerArgs: IArguments): void;
  child(component: string): Logger;
}

export interface LoggerOptions {
  // Prefix used in log messages
  // Example: "banana" produces logs like [banana:component]
  prefix: string;
  level?: "debug" | "info" | "warn" | "error";
}

// Log detailed function info including name and arguments
// Useful for debugging command execution flow
// This version is generic and works with any debug function, making it easy
// for custom logger implementations to use
// Example usage in a custom logger:
//   logFunctionInfo(args) {
//     genericLogFunctionInfo(this.debug.bind(this), args)
//   }
export function genericLogFunctionInfo(
  debugFn: (msg: string) => void,
  callerArgs: IArguments,
) {
  const stack = new Error().stack!;
  const callerInfo = stack.split("\n")[2]!.trim();
  const functionName = callerInfo.split(" ")[1];

  // Extract filename from stack trace
  // Format: "at functionName (filepath:line:col)" or "at filepath:line:col"
  let callerFileName = "unknown";
  const parenMatch = callerInfo.match(/\(([^:]+)/);
  if (parenMatch) {
    callerFileName = parenMatch[1]!.split("/").pop() || "unknown";
  }

  debugFn(
    `->))) ${callerFileName}:${functionName} called with arguments: ${JSON.stringify(
      // Convert arguments to array for JSON serialization
      Array.from(callerArgs),
      null,
      2,
    )}`,
  );
}

export function createDefaultLogger(prefix: string): Logger {
  const rootLogger = winston.createLogger({
    level: "debug",
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      winston.format.timestamp(),
      winston.format.printf(
        ({ timestamp, level, message, component }) =>
          `[${prefix}:${component || "root"}] ${timestamp} ${level}: ${message}`,
      ),
    ),
    transports: [new winston.transports.Console()],
  });

  // Helper function to wrap any winston logger instance into our Logger
  // interface. This is used both for the root logger and for child loggers
  function wrapWinstonLogger(winstonLogger: winston.Logger): Logger {
    return {
      info(message: string) {
        winstonLogger.info(message);
      },
      warn(message: string) {
        winstonLogger.warn(message);
      },
      error(message: string) {
        winstonLogger.error(message);
      },
      debug(message: string) {
        winstonLogger.debug(message);
      },
      logFunctionInfo(callerArgs: IArguments) {
        genericLogFunctionInfo((msg) => winstonLogger.debug(msg), callerArgs);
      },
      child(component: string): Logger {
        // Create a winston child and wrap it using the same helper
        // This avoids infinite recursion since we're calling winston's child(),
        // not our own child()
        const childWinston = winstonLogger.child({ component });
        return wrapWinstonLogger(childWinston);
      },
    };
  }

  return wrapWinstonLogger(rootLogger);
}
