// This file houses shell usage with zx and provides a wrapper for common
// patterns
//
// A note on directories, `process.chdir()`
import * as zx from "zx";

// defaultShellOptions returns the default options for shell commands. The two options now are:
// - Verbosity
// - Respecting process.cwd()
//
// XXX <27-10-2026,afjoseph> The reason for the `cwd` might seem
// counterintuitive (why we set the directory to the current working directory
// for every command?). ZX actually does not respect `process.chdir()` by
// default: each command zx works with the directory it captured when the
// import of the file first happens, not mid-process. This means if you start
// with directory A, import zx, then run `process.chdir(B)`, zx will just run
// commands in directory A, which is extra confusing
//
// To ameliorate this, we set the `cwd` option to respect `process.chdir()`
// directory changes
//
// Also, assuming we use zx's standard way of cd'ing into directories (i.e.,
// `zx.cd()`), we'll still have an issue that any function we don't control,
// that calls process.chdir(), will not be respected without the `cwd:
// process.cwd()`
function defaultShellOptions(): Partial<zx.Options> {
  return {
    verbose: true,
    cwd: process.cwd(),
  };
}

// $$ is a wrapper around zx.$ that sets default options for shell commands and can be run in two ways:
// 1. As a tagged template literal:
//
//    $$`ls -la`
//
// 2. As a function that returns a tagged template literal:
//
//    $$({ env: { ...process.env, HABIBI: "1" })`ls -la`
//
// Remember that Partial<T> turns all properties of T into optional properties,
// so you can pass only the options we want to override
//
// The function below is overloaded to support both usages: using
// TemplateStringsArray (i.e., as you would run $$`ls -la`) and using
// Partial<zx.Options> (i.e., as you would run $$({ env: { ...process.env,
// HABIBI: "1" })`ls -la`), with a 3rd implementation that handles both cases
// using a fun TS union type
//
// Be mindful that errors thrown from here are of type zx.ProcessOutput, which
// is exported from this file as ShellError
//
// This means calling code should do:
//
//     import * as sh from "yesod/shell";
//     try {
//         await sh.$$`echo alalalalalala`;
//     } catch (err) {
//         if (err instanceof sh.ShellError) {
//             // handle error
//         }
//     }
//
export function $$(
  pieces: TemplateStringsArray,
  ...args: any[]
): zx.ProcessPromise;
export function $$(
  opts: Partial<zx.Options>,
): (pieces: TemplateStringsArray, ...args: any[]) => zx.ProcessPromise;
export function $$(
  first: TemplateStringsArray | Partial<zx.Options>,
  ...rest: any[]
) {
  // Check if this is a TemplateStringsArray, which has a "raw" property (see
  // ./node_modules/typescript/lib/lib.es5.d.ts,
  // which might change), but it'll give you an idea where to look)
  if ("raw" in first) {
    return zx.$({
      ...defaultShellOptions(),
    })(first, ...rest);
  }

  // Else, this is a Partial<zx.Options>, so we return a function that takes a
  // TemplateStringsArray and calls zx.$ with the default options merged with the
  // provided options
  return (pieces: TemplateStringsArray, ...args: any[]) => {
    return zx.$({
      ...defaultShellOptions(),
      ...first,
    })(pieces, ...args);
  };
}

// withDir runs fn in the given directory, and return to the original directory
// after fn is done
//
// XXX <26-10-2026,afjoseph> Calling this changes the directory for the entire
// process, so this function is **not thread-safe**. That's fine, though. Just
// be mindful when using it. The async version of it is left as a comment for
// reference
export async function withDir<T>(
  dirPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalDir = process.cwd();
  process.chdir(dirPath);
  try {
    return await fn();
  } finally {
    process.chdir(originalDir);
  }

  // return zx.within(async () => {
  //   zx.$.cwd = path.resolve(dirPath);
  //   return await fn();
  // });
}

// Re-export ProcessOutput and ShellError from zx
export { ProcessOutput, ProcessOutput as ShellError } from "zx";
