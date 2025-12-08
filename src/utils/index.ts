import humanizeDuration from "humanize-duration";
import { randomBytes } from "crypto";
import * as log from "../log";
import { $ } from "bun";

// Execute a callback in a specific directory, then return to the original
// Ensures the original directory is restored even if the callback throws
//
// Example:
//   const result = await withDir("/some/path", async () => {
//     // cwd is now /some/path
//     return await doSomething()
//   })
//   // cwd is restored to original
export async function withDir<T>(
  dirPath: string,
  callback: () => Promise<T>,
): Promise<T> {
  const originalDir = process.cwd();
  try {
    process.chdir(dirPath);
    return await callback();
  } finally {
    // Always change back to the original directory, even if an error occurs
    process.chdir(originalDir);
  }
}

// Run a function and measure its execution time
// Logs the duration using humanized format (e.g., "2 minutes, 30 seconds")
//
// Example:
//   await runAndMeasure("Database migration", logger, async () => {
//     await migrate()
//   })
//   // Logs: "runAndMeasure: Database migration took 2 minutes, 30 seconds"
export async function runAndMeasure(
  label: string,
  logger: log.Logger,
  func: () => Promise<void>,
): Promise<void> {
  const start = performance.now();
  await func();
  const end = performance.now();
  logger.info(`runAndMeasure: ${label} took ${humanizeDuration(end - start)}`);
}

// Generate a cryptographically random hex string of the specified byte length
// The output string will be twice the byte length (since each byte = 2 hex
// chars)
//
// Example:
//   getCryptoRandomString(8)  // Returns something like "a1b2c3d4e5f6g7h8"
//   getCryptoRandomString(16) // Returns a 32-character hex string
export function getCryptoRandomString(lengthOfBytes: number): string {
  if (lengthOfBytes <= 0) {
    throw new Error("Length must be a positive integer");
  }

  // Ensure even length for consistent hex representation
  let adjustedLength = lengthOfBytes;
  if (adjustedLength % 2 !== 0) {
    adjustedLength += 1;
  }

  // Generate random bytes and convert to hex
  const bytes = randomBytes(adjustedLength);
  return bytes.toString("hex").slice(0, adjustedLength * 2);
}

// Format a duration in milliseconds to a human-readable string Uses
// humanize-duration under the hood
//
// Example:
//   formatDuration(125000) // "2 minutes, 5 seconds"
export function formatDuration(milliseconds: number): string {
  return humanizeDuration(milliseconds);
}

export function p$(strings: TemplateStringsArray, ...expressions: any[]) {
  console.log(
    expressions.reduce(
      (a: string, exp, i) =>
        a +
        (typeof exp === "string"
          ? /\s/.test(exp) && !"'\"".includes(String(exp[0]))
            ? `"${exp}"`
            : exp
          : typeof exp === "number"
            ? exp.toString()
            : exp && "raw" in exp
              ? exp.raw
              : `{${exp}}`) +
        strings[i + 1],
      "cmd: $ " + strings[0],
    ),
  );
  return $(strings, ...expressions);
}
