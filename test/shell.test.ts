import { describe, it, before, after } from "node:test";
import { expect } from "expect";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { $$, withDir, ShellError } from "../src/shell.ts";

describe("Shell Tests", () => {
  let dirA: string;
  let dirB: string;

  before(() => {
    dirA = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "yesod-bababa-")),
    );
    dirB = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "yesod-jajaja-")),
    );
  });

  after(() => {
    fs.rmSync(dirA, { recursive: true, force: true });
    fs.rmSync(dirB, { recursive: true, force: true });
  });

  it("should run $$ in the directory set by withDir", async () => {
    const originalDir = process.cwd();
    const pwd = await withDir(dirA, async () => {
      return (await $$`pwd -P`.quiet()).stdout.trim();
    });
    expect(pwd).toBe(dirA);
    expect(process.cwd()).toBe(originalDir);
  });

  it("should let $$({ cwd }) override the default cwd", async () => {
    const pwd = await withDir(dirA, async () => {
      return (await $$({ cwd: dirB })`pwd -P`.quiet()).stdout.trim();
    });
    expect(pwd).toBe(dirB);
  });

  it("should throw ShellError on a non-zero exit", async () => {
    await expect($$`exit 666`.quiet()).rejects.toBeInstanceOf(ShellError);
  });
});
