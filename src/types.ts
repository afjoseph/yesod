import * as log from "./log.ts";

// Command definition interface for registering commands with yesod
// Each command has an action function and optional metadata
export interface CommandDefinition {
  // The function that executes when this command is invoked
  // positionalArgs: arguments without key: prefix, in order
  // namedArgs: key-value pairs from key:value syntax
  action: (
    positionalArgs: string[],
    namedArgs: Record<string, string>,
  ) => Promise<any>;
  // Human-readable description of the command
  description?: string;
  // Human-readable description of the arguments
  argsDescription?: string[];
  // If set, indicates the command returns a value and must be assigned to a variable
  // Example: returns: "Path to config file (string)"
  returns?: string;
}

// Options passed to main() to configure an instance of Yesod
export interface InstanceOptions {
  // Commands to register
  commands: Record<string, CommandDefinition>;

  // Optional path to the file where commands are defined, shown in the help
  // message
  commandsPath?: string;

  // Optional custom logger instance. If not provided, a default logger is
  // created
  logger?: log.Logger;
  // Optional log file prefix. If not, defaults to "YESOD"
  logPrefix?: string;
  // Optional absolute directory of where to store log files. Defaults to
  // "__logs" in the current working directory
  logsDir?: string;

  // Optional callback that runs before any command is executed, when the Yesod
  // instance is initialized
  onInit?: () => Promise<void>;

  // Optional callback that runs inside process.on("exit"), after all commands
  // have finished executing
  //
  // Be mindful that we can **only** have synchronous work here, since this
  // runs after the event loop has been drained and the process is about to
  // exit
  onExit?: (ctx: OnExitContext) => void;
}

// Context passed to onExit callback
export interface OnExitContext {
  logsDir: string;
  logFilePath: string;
  exitCode: number;
}
