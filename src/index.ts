import * as log from "./log";
import * as types from "./types";
import * as parser from "./parser";
import * as runner from "./runner";

export function createYesod(
  options: types.YesodOptions,
): types.Yesod {
  let logger: log.Logger;
  if (options.logger) {
    logger = options.logger;
  } else {
    logger = log.createDefaultLogger(options.name);
  }

  // Command registry
  const commandMap: Record<string, types.CommandDefinition> = {};

  // Register a command
  function register(
    cmdName: string,
    definition: types.CommandDefinition,
  ): void {
    if (commandMap[cmdName]) {
      logger.warn(`Overwriting existing command: ${cmdName}`);
    }
    commandMap[cmdName] = definition;
  }

  // Display help text
  function showHelp(): void {
    console.log(
      `Usage: ./${options.name}/x <command1> [arg1:value] [arg2:value] <command2> ...\n`,
    );
    console.log("Available commands:");

    for (const [cmdName, def] of Object.entries(commandMap)) {
      console.log(`  ${cmdName}`);
      if (def.description) {
        console.log(`    ${def.description}`);
      }
      if (def.argsDescription && def.argsDescription.length > 0) {
        console.log("    ARGUMENTS:");
        for (const arg of def.argsDescription) {
          console.log(`    * ${arg}`);
        }
      }
      if (def.returns) {
        console.log(`    RETURNS: ${def.returns}`);
      }
    }
  }

  // Get registered commands
  function getCommands(): Record<string, types.CommandDefinition> {
    return { ...commandMap };
  }

  // Run commands from CLI arguments
  async function run(args: string[]): Promise<Record<string, any>> {
    // Handle help flag
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
      showHelp();
      return {};
    }

    // Join args and parse
    const input = args.join(" ");
    logger.info(`Parsing: ${input}`);

    const statements = parser.tokenize(input);
    logger.debug(`Parsed ${statements.length} statement(s)`);

    // Validate all commands exist before executing
    const errors = runner.validateStatements(statements, commandMap);
    if (errors.length > 0) {
      logger.error(`Validation failed with ${errors.length} error(s):`);
      for (const err of errors) {
        logger.error(`  - ${err}`);
      }
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    // Execute statements
    const result = await runner.executeStatements(statements, commandMap, {
      logger,
      workingDir: process.cwd(),
    });

    // Log execution summary
    runner.logExecutionSummary(result, logger);

    return result.globalContext;
  }

  return {
    register,
    run,
    showHelp,
    getCommands,
  };
}
