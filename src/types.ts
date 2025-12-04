import * as log from "./log";

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
  // Human-readable description shown in --help
  description?: string;
  // Detailed argument descriptions for help text
  // Example: ["REQUIRED env: The environment (staging/production)", "OPTIONAL verbose: Enable verbose output"]
  argsDescription?: string[];
  // If set, indicates the command returns a value and must be assigned to a variable
  // Example: returns: "Path to config file (string)"
  returns?: string;
}

// The main Yesod instance returned by createYesod
export interface Yesod {
  // Register a command with the yesod
  register(name: string, definition: CommandDefinition): void;
  // Execute commands from CLI arguments
  // Returns the global context with any assigned variables
  run(args: string[]): Promise<Record<string, any>>;
  // Display help text showing all registered commands
  showHelp(): void;
  // Access the registered commands
  getCommands(): Record<string, CommandDefinition>;
}

// Options passed to createYesod
export interface YesodOptions {
  // Name used in log prefixes
  // Example: "banana" produces logs like [banana:component]
  name: string;
  // Optional custom logger instance
  // If not provided, a default winston logger is created
  logger?: log.Logger;
}
