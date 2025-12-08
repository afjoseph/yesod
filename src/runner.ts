import * as log from "./log";
import { resolveCommandArgs } from "./parser";
import type { Statement } from "./parser";
import { withDir, formatDuration } from "./utils";
import * as types from "./types";

// Options for executing statements
export interface ExecutionOptions {
  // Logger for execution output
  logger: log.Logger;
  // Working directory to execute commands from
  // If not specified, uses current working directory
  workingDir?: string;
}

// Result of executing statements
export interface ExecutionResult {
  // The global context containing all assigned variables
  globalContext: Record<string, any>;
  // Execution time per command in milliseconds
  executionTimes: Record<string, number>;
  // Total execution time in milliseconds
  totalTime: number;
}

// Validate all statements before execution
// Returns an array of error messages (empty if valid)
//
// Checks:
// - Command exists in commandMap
// - Commands with returns must be assigned to a variable
export function validateStatements(
  statements: Statement[],
  commandMap: Record<string, types.CommandDefinition>,
): string[] {
  const errors: string[] = [];

  for (const stmt of statements) {
    const command = commandMap[stmt.command.name];

    // Check if command exists
    if (!command) {
      errors.push(`Unknown command: '${stmt.command.name}'`);
      continue;
    }

    // Check if command returns a value and must be assigned
    if (command.returns && stmt.type === "command") {
      errors.push(
        `Command '${stmt.command.name}' returns a value and must be assigned to a variable\n` +
          `  Expected: varname:(${stmt.command.name} ...) or _:(${stmt.command.name} ...) to ignore the return value\n` +
          `  Returns: ${command.returns}`,
      );
    }
  }

  return errors;
}

// Execute a list of statements
// Statements are executed in order
// Variable assignments store results in the global context
// The global context is passed to subsequent commands for variable resolution
//
// Example flow:
//   cfg:(get-config env:prod)   -> executes get-config, stores result in globalContext.cfg
//   (deploy config:$cfg)        -> resolves $cfg from context, executes deploy
export async function executeStatements(
  statements: Statement[],
  commandMap: Record<string, types.CommandDefinition>,
  options: ExecutionOptions,
): Promise<ExecutionResult> {
  const { logger, workingDir } = options;
  const globalContext: Record<string, any> = {};
  const executionTimes: Record<string, number> = {};
  const startTime = performance.now();

  for (const stmt of statements) {
    // Command is guaranteed to exist after validation
    const command = commandMap[stmt.command.name]!;

    // Resolve variable references in arguments
    const { resolvedPositionalArgs, resolvedNamedArgs } = resolveCommandArgs(
      globalContext,
      stmt.command,
    );

    // Track execution time for this command
    const cmdStartTime = performance.now();

    // Execute command, optionally from a specific working directory
    const executeCommand = async () => {
      if (stmt.type === "assignment") {
        logger.info(
          `Executing assignment: ${stmt.variableName} = (${stmt.command.name} ...)`,
        );
        const result = await command.action(
          resolvedPositionalArgs,
          resolvedNamedArgs,
        );
        globalContext[stmt.variableName] = result;
      } else {
        logger.info(`Executing: (${stmt.command.name} ...)`);
        await command.action(resolvedPositionalArgs, resolvedNamedArgs);
      }
    };

    // Run from working directory if specified
    if (workingDir) {
      await withDir(workingDir, executeCommand);
    } else {
      await executeCommand();
    }

    executionTimes[stmt.command.name] = performance.now() - cmdStartTime;
  }

  const totalTime = performance.now() - startTime;

  return {
    globalContext,
    executionTimes,
    totalTime,
  };
}

// Log execution timing summary
export function logExecutionSummary(
  result: ExecutionResult,
  logger: log.Logger,
): void {
  // Build humanized execution times
  const humanizedTimes: Record<string, string> = {};
  for (const [cmd, time] of Object.entries(result.executionTimes)) {
    humanizedTimes[cmd] = formatDuration(time);
  }

  logger.info(
    `Command execution times: ${JSON.stringify(humanizedTimes, null, 2)}`,
  );
  logger.info(`Total execution time: ${formatDuration(result.totalTime)}`);
}
