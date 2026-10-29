import * as log from "./log.ts";
import * as crypto from "node:crypto";
import * as types from "./types.ts";
import * as parser from "./parser.ts";
import * as runner from "./runner.ts";
import * as sh from "yesod/shell";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import dayjs from "dayjs";

const DEFAULT_LOGS_DIR = "__logs";

export async function main(opts: types.InstanceOptions): Promise<void> {
  // Init logger, or take one if supplied
  const logger =
    opts.logger ?? log.createDefaultLogger(opts.logPrefix ?? "YESOD");

  // Register commands
  const commandMap: Record<string, types.CommandDefinition> = {};
  for (const [name, def] of Object.entries(opts.commands)) {
    commandMap[name] = def;
  }

  // Check if help is requested
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: ./x 'YESOD_EXPRESSION'`);
    if (opts.commandsPath) {
      console.log(
        `See ${opts.commandsPath} for available commands and usage\n`,
      );
    }
    return;
  }

  // Make INVOCATIONID and set it for the whole process
  const invocationID = makeInvocationID();
  process.env.INVOCATIONID = invocationID;

  // Make log file, set it for the whole process and start teeing
  const logFilePath = await makeLogFile(
    invocationID,
    opts.logPrefix ?? "YESOD",
    opts.logsDir,
  );
  process.env.YESOD_LOG_FILE = logFilePath;
  console.log(`[${opts.logPrefix}] Logging to ${logFilePath}`);
  const stopTeeingToLogFile = startTee(logFilePath);

  // Install handlers
  installSignalHandler();
  installUncaughtExceptionHandler();
  installExitHandler({
    invocationID,
    logsPrefix: opts.logPrefix ?? "YESOD",
    logsDir: opts.logsDir ?? path.join(process.cwd(), DEFAULT_LOGS_DIR),
    logFilePath,
    stopTeeingToLogFile,
    onExit: opts.onExit,
  });

  // Run lifecycle
  await printInvocationReceipt(invocationID, args, false);
  await opts.onInit?.();
  try {
    // Join args and tokenize
    const input = args.join(" ");
    const statements = parser.tokenize(input);

    // Validate commands before executing
    const errors = runner.validateStatements(statements, commandMap);
    if (errors.length > 0) {
      logger.error(`Validation failed with ${errors.length} error(s):`);
      for (const err of errors) {
        logger.error(`  - ${err}`);
      }
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }

    // Execute and log summary
    const result = await runner.executeStatements(
      logger,
      statements,
      commandMap,
    );
    runner.logExecutionSummary(logger, result);
  } catch (err) {
    // If the error is not a known ShellError, we don't know how to handle it.
    // Just rethrow
    if (!(err instanceof sh.ShellError)) {
      throw err;
    }

    logger.error(sh.humanizeShellError(err));
    process.exit(1);
  }

  await printInvocationReceipt(invocationID, args, true);
}

// installExitHandler sets up a process.on("exit") handler that will call the
// provided onExit callback, stop teeing to log file, and generally
// finalize the process
async function installExitHandler(opts: {
  invocationID: string;
  logsPrefix: string;
  logsDir: string;
  logFilePath: string;
  stopTeeingToLogFile: () => void;
  onExit?: (ctx: types.OnExitContext) => void;
}): Promise<void> {
  process.on("exit", (exitcode) => {
    // Stop teeing
    opts.stopTeeingToLogFile();

    try {
      opts.onExit?.({
        logsDir: opts.logsDir,
        logFilePath: opts.logFilePath,
        exitCode: exitcode,
      });
    } catch (err) {
      console.error(
        `[${opts.logsPrefix}] Error in onExit callback: ${err instanceof Error ? err.stack : String(err)}`,
      );
    }

    console.log(`[${opts.logsPrefix}] InvocationID: ${opts.invocationID}`);
    console.log(`[${opts.logsPrefix}] Log file: ${opts.logFilePath}`);
  });
}

// installUncaughtExceptionHandler sets up a handler for uncaught exceptions
// that just logs and exits
async function installUncaughtExceptionHandler(): Promise<void> {
  process.on("uncaughtException", (err) => {
    console.error(
      `[uncaughtException] Uncaught exception: ${err instanceof Error ? err.stack : String(err)}`,
    );
    process.exit(1);
  });
}

// installSignalHandler sets up handlers for SIGINT/SIGTERM
async function installSignalHandler(): Promise<void> {
  // Essentially catch handlers and exit with code 1
  // XXX <29-10-2026,afjoseph> If we wanna be pedantic about it, we should
  // probably exit with the same code as the signal (+128, if I remember
  // correctly), but not an issue now
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      // Don't exit if there are other listeners for this signal. This is
      // important since commands like the ones in commands_excvback.ts
      // actually own the signal and can handle it themselves
      if (process.listenerCount(signal) > 1) {
        console.warn(
          `[${signal}] Signal received, but there are other listeners. Not exiting`,
        );
        return;
      }
      process.exit(1);
    });
  }
}

// makeLogFile creates a log file in logsDir, returning the path to the log
// file
async function makeLogFile(
  invocationID: string,
  logPrefix: string,
  logsDir?: string,
): Promise<string> {
  // Create logs directory if it doesn't exist
  logsDir = logsDir ?? path.join(process.cwd(), DEFAULT_LOGS_DIR);
  fs.mkdirSync(logsDir ?? path.join(logsDir, DEFAULT_LOGS_DIR), {
    recursive: true,
  });

  // Create log file name with timestamp, username, and invocation ID
  const logFileName = `${logPrefix}_${dayjs().format("YYMMDDHHmmss")}_${os.userInfo().username}_${invocationID}.log`;

  return path.join(logsDir, logFileName);
}

// startTee copies all stdout/stderr from this process into logFilePath,
// essentially "teeing" the output. It returns a function that restores the
// original stdout/stderr streams and closes the log file, which is meant to be
// called on process exit
function startTee(logFilePath: string): () => void {
  // Open log file
  const fd = fs.openSync(logFilePath, "a");
  // Get current streams for thsi process
  const processStdioStreams = [process.stdout, process.stderr];

  // Save original stream writers
  const originalProcessStdioWriters = processStdioStreams.map((s) => s.write);

  // For each stream, override the write method to write to both the log file
  // and the original stream. Essentially, making a "tee"
  for (let i = 0; i < processStdioStreams.length; i++) {
    const stream = processStdioStreams[i]!;
    const originalWriter = originalProcessStdioWriters[i]!;

    // Override
    stream.write = (chunk: string | Uint8Array, ...rest: any[]): boolean => {
      // Write to tee'd log file
      // XXX <29-10-2026,afjoseph> I tried to do it with fs.writeSync, but it
      // failed with a type issue and took some research to find that
      // appendFileSync is a better fit for the same thing: I believe the two
      // functions are close-enough in ambiguity to merit a comment
      fs.appendFileSync(fd, chunk);
      // Write to original stream
      return Reflect.apply(originalWriter, stream, [chunk, ...rest]);
    };
  }

  // Restore original writers on exit
  return () => {
    for (let i = 0; i < processStdioStreams.length; i++) {
      const stream = processStdioStreams[i]!;
      const originalWriter = originalProcessStdioWriters[i]!;
      stream.write = originalWriter;
    }
    fs.closeSync(fd);
  };
}

// printInvocationReceipt prints a receipt of the invocation to stdout and
// copies it to the clipboard in an acceptable format
async function printInvocationReceipt(
  invocationID: string,
  args: string[],
  showSuccess: boolean,
) {
  const quiet$$ = sh.$$({ quiet: true });
  const repoInfo = `${(await quiet$$`basename $(git rev-parse --show-toplevel)`).stdout.toString().trim()}:${(await quiet$$`git rev-parse --abbrev-ref HEAD`).stdout.toString().trim()}:${(await quiet$$`git rev-parse --short HEAD`).stdout.toString().trim()}`;
  const invocationBlock = `// ${invocationID}
// ${repoInfo}${showSuccess ? "\n// RAN SUCCESSFULLY" : ""}
./x ${quoteArgs(args)}`;
  console.log(`\n${invocationBlock}\n`);
  // Copy to clipboard for easy pasting into notes
  await quiet$$`echo ${invocationBlock} | pbcopy`;
}

// Single-quote each arg so the receipt can be pasted back into a shell
function quoteArgs(args: string[]): string {
  return args.map((a) => `'${a.replaceAll("'", `'\\''`)}'`).join(" ");
}

function makeInvocationID(): string {
  return `INVO${crypto.randomBytes(4).toString("hex")}`;
}

// Reexport OnExitContext for convenience of callers
export type OnExitContext = types.OnExitContext;
