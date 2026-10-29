import { describe, it } from "node:test";
import { expect } from "expect";
import {
  tokenize,
  resolveCommandArgs,
  type ExecutableCommand,
} from "../src/parser.ts";
import { validateStatements, executeStatements } from "../src/runner.ts";
import { createDefaultLogger } from "../src/log.ts";

describe("Parser Tests", () => {
  it("should parse a simple command in parentheses", () => {
    const input = "(do:me)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "do:me",
          positionalArgs: [] as string[],
          namedArgs: {},
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with positional arguments", () => {
    const input = '(db:copy "aaa.txt" /aaa/bbb)';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "db:copy",
          positionalArgs: ["aaa.txt", "/aaa/bbb"],
          namedArgs: {},
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with named arguments", () => {
    const input = '(deploy service:hahaha version:"1.2.3")';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "deploy",
          positionalArgs: [] as string[],
          namedArgs: {
            service: "hahaha",
            version: "1.2.3",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with mixed positional and named arguments", () => {
    const input = '(build "app/sss" env:production aaa:bbb)';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "build",
          positionalArgs: ["app/sss"],
          namedArgs: {
            env: "production",
            aaa: "bbb",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with a variable reference", () => {
    const input = "(deploy config:$sss)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "deploy",
          positionalArgs: [] as string[],
          namedArgs: {
            config: { type: "variable-ref" as const, name: "sss" },
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a variable assignment statement", () => {
    const input = "myVar:(getconfig env:prod)";
    const expected = [
      {
        type: "assignment" as const,
        variableName: "myVar",
        command: {
          name: "getconfig",
          positionalArgs: [] as string[],
          namedArgs: {
            env: "prod",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse multiple statements", () => {
    const input = "(cmd1) myVar:(cmd2 val) (cmd33 key:value)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "cmd1",
          positionalArgs: [] as string[],
          namedArgs: {} as Record<string, string>,
        },
      },
      {
        type: "assignment" as const,
        variableName: "myVar",
        command: {
          name: "cmd2",
          positionalArgs: ["val"],
          namedArgs: {} as Record<string, string>,
        },
      },
      {
        type: "command" as const,
        command: {
          name: "cmd33",
          positionalArgs: [] as string[],
          namedArgs: { key: "value" },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should throw an error for a command not in parentheses", () => {
    const input = "ssss";
    expect(() => tokenize(input)).toThrow();
  });

  it("should throw an error for unbalanced parentheses", () => {
    const input = "(ssss";
    expect(() => tokenize(input)).toThrow();
  });

  it("should handle escaped quotes in strings correctly", () => {
    const input = '(echo "this is a \\"fuckedup\\" string")';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "echo",
          positionalArgs: ['this is a "fuckedup" string'],
          namedArgs: {},
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should return empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("should handle comments in input", () => {
    const input = "(cmd1) // this is a commentbuaahaha\n(cmd2)";
    const result = tokenize(input);
    expect(result.length).toBe(2);
    expect((result[0] as ExecutableCommand).command.name).toBe("cmd1");
    expect((result[1] as ExecutableCommand).command.name).toBe("cmd2");
  });

  it("should handle hashtag comments in input", () => {
    const input = "(cmd1) # this is a commentallahakbar\n(cmd2)";
    const result = tokenize(input);
    expect(result.length).toBe(2);
    expect((result[0] as ExecutableCommand).command.name).toBe("cmd1");
    expect((result[1] as ExecutableCommand).command.name).toBe("cmd2");
  });

  it("should parse a literal assignment with a quoted string", () => {
    const input = 'hahaha:"/path/to/narnia"';
    const expected = [
      {
        type: "literal-assignment" as const,
        variableName: "hahaha",
        value: "/path/to/narnia",
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a literal assignment with a bareword", () => {
    const input = "env:production";
    const expected = [
      {
        type: "literal-assignment" as const,
        variableName: "env",
        value: "production",
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a literal assignment with a variable reference", () => {
    const input = "home:$HOME";
    const expected = [
      {
        type: "literal-assignment" as const,
        variableName: "home",
        value: { type: "variable-ref" as const, name: "HOME" },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a literal assignment followed by a command using the variable", () => {
    const input = 'hahaha:"/path/to/narnia" (build narnia-path:$hahaha)';
    const expected = [
      {
        type: "literal-assignment" as const,
        variableName: "hahaha",
        value: "/path/to/narnia",
      },
      {
        type: "command" as const,
        command: {
          name: "build",
          positionalArgs: [] as string[],
          namedArgs: {
            "narnia-path": { type: "variable-ref" as const, name: "hahaha" },
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with colons in the name", () => {
    const input = "(server1:deploy aaa:bbb)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "server1:deploy",
          positionalArgs: [] as string[],
          namedArgs: {
            aaa: "bbb",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });
});

describe("Argument Resolution Tests", () => {
  it("should resolve string arguments as-is", () => {
    const context = {};
    const command = {
      name: "habibi",
      positionalArgs: ["hello", "world"] as string[],
      namedArgs: { key: "value" } as Record<string, string>,
    };
    const result = resolveCommandArgs(context, command);
    expect(result.resolvedPositionalArgs).toEqual(["hello", "world"]);
    expect(result.resolvedNamedArgs).toEqual({ key: "value" });
  });

  it("should resolve variable references from context", () => {
    const context = { myVar: "/path/to/config" };
    const command = {
      name: "habibi",
      positionalArgs: [] as string[],
      namedArgs: { config: { type: "variable-ref" as const, name: "myVar" } },
    };
    const result = resolveCommandArgs(context, command);
    expect(result.resolvedNamedArgs).toEqual({ config: "/path/to/config" });
  });

  it("should throw for undefined variable references", () => {
    const context = {};
    const command = {
      name: "habibi",
      positionalArgs: [] as string[],
      namedArgs: { config: { type: "variable-ref" as const, name: "missing" } },
    };
    expect(() => resolveCommandArgs(context, command)).toThrow(
      "Variable 'missing' is not defined",
    );
  });
});

describe("Runner Integration Tests", () => {
  const logger = createDefaultLogger("habibi");

  it("should execute a simple command", async () => {
    let called = false;

    await executeStatements(logger, tokenize("(ping)"), {
      ping: {
        action: async () => {
          called = true;
        },
      },
    });
    expect(called).toBe(true);
  });

  it("should pass arguments to commands", async () => {
    let receivedArgs: any = null;

    await executeStatements(logger, tokenize("(echo hello key:value)"), {
      echo: {
        action: async (pos, named) => {
          receivedArgs = { pos, named };
        },
      },
    });
    expect(receivedArgs!).toEqual({
      pos: ["hello"],
      named: { key: "value" },
    });
  });

  it("should handle variable assignment and resolution", async () => {
    const result = await executeStatements(
      logger,
      tokenize("x:(get-value) (use-value val:$x)"),
      {
        "get-value": { action: async () => "my-value", returns: "string" },
        "use-value": {
          action: async (_, named) => named.val,
        },
      },
    );

    expect(result.globalContext.x).toBe("my-value");
  });

  it("should handle environment variables", async () => {
    // Set an environment variable for testing
    process.env.TEST_ENV_VAR = "bunnyfoofoo";

    const result = await executeStatements(
      logger,
      tokenize("x:(hi val:$TEST_ENV_VAR)"),
      { hi: { action: async (_, named) => named.val } },
    );

    expect(result.globalContext.x).toBe("bunnyfoofoo");
  });

  it("should propagate a literal assignment to subsequent commands", async () => {
    let receivedNamed: any = null;

    const result = await executeStatements(
      logger,
      tokenize('hahaha:"/path/to/narnia" (echo narnia-path:$hahaha)'),
      {
        echo: {
          action: async (_, named) => {
            receivedNamed = named;
          },
        },
      },
    );

    expect(result.globalContext.hahaha).toBe("/path/to/narnia");
    expect(receivedNamed!).toEqual({ "narnia-path": "/path/to/narnia" });
  });

  it("should resolve env-var fallback through a literal assignment", async () => {
    process.env.ENV_FALLBACK = "fromenv";

    const result = await executeStatements(
      logger,
      tokenize("x:$ENV_FALLBACK (hi val:$x)"),
      { hi: { action: async (_, named) => named.val } },
    );

    expect(result.globalContext.x).toBe("fromenv");
  });

  it("should report unknown commands", () => {
    const errors = validateStatements(tokenize("(unknown-command)"), {});

    expect(errors.join("\n")).toContain("Unknown command");
  });

  it("should report unassigned return-value commands", () => {
    const errors = validateStatements(tokenize("(getconfig)"), {
      getconfig: { action: async () => "/path", returns: "string" },
    });

    expect(errors.join("\n")).toContain("must be assigned to a variable");
  });
});
