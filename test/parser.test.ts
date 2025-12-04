import { describe, it, expect } from "bun:test";
import { tokenize, resolveCommandArgs } from "../src/parser";
import { createYesod } from "../src/index";

describe("Parser Tests", () => {
  it("should parse a simple command in parentheses", () => {
    const input = "(my-command)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "my-command",
          positionalArgs: [] as string[],
          namedArgs: {},
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with positional arguments", () => {
    const input = '(copy "source file.txt" /dest/path)';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "copy",
          positionalArgs: ["source file.txt", "/dest/path"],
          namedArgs: {},
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with named arguments", () => {
    const input = '(deploy service:api version:"1.2.3")';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "deploy",
          positionalArgs: [] as string[],
          namedArgs: {
            service: "api",
            version: "1.2.3",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with mixed positional and named arguments", () => {
    const input = '(build "app/component" env:production optimize:true)';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "build",
          positionalArgs: ["app/component"],
          namedArgs: {
            env: "production",
            optimize: "true",
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a command with a variable reference", () => {
    const input = "(deploy config:$deployConfig)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "deploy",
          positionalArgs: [] as string[],
          namedArgs: {
            config: { type: "variable-ref" as const, name: "deployConfig" },
          },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should parse a variable assignment statement", () => {
    const input = "myVar:(get-config env:prod)";
    const expected = [
      {
        type: "assignment" as const,
        variableName: "myVar",
        command: {
          name: "get-config",
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
    const input = "(command1) myVar:(command2 val) (command3 key:value)";
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "command1",
          positionalArgs: [] as string[],
          namedArgs: {} as Record<string, string>,
        },
      },
      {
        type: "assignment" as const,
        variableName: "myVar",
        command: {
          name: "command2",
          positionalArgs: ["val"],
          namedArgs: {} as Record<string, string>,
        },
      },
      {
        type: "command" as const,
        command: {
          name: "command3",
          positionalArgs: [] as string[],
          namedArgs: { key: "value" },
        },
      },
    ];
    expect(tokenize(input)).toEqual(expected);
  });

  it("should throw an error for a command not in parentheses", () => {
    const input = "my-command";
    expect(() => tokenize(input)).toThrow();
  });

  it("should throw an error for unbalanced parentheses", () => {
    const input = "(my-command";
    expect(() => tokenize(input)).toThrow();
  });

  it("should handle escaped quotes in strings correctly", () => {
    const input = '(echo "this is a \\"quoted\\" string")';
    const expected = [
      {
        type: "command" as const,
        command: {
          name: "echo",
          positionalArgs: ['this is a "quoted" string'],
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
    const input = "(command1) // this is a comment\n(command2)";
    const result = tokenize(input);
    expect(result.length).toBe(2);
    expect(result[0]!.command.name).toBe("command1");
    expect(result[1]!.command.name).toBe("command2");
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
      name: "test",
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
      name: "test",
      positionalArgs: [] as string[],
      namedArgs: { config: { type: "variable-ref" as const, name: "myVar" } },
    };
    const result = resolveCommandArgs(context, command);
    expect(result.resolvedNamedArgs).toEqual({ config: "/path/to/config" });
  });

  it("should throw for undefined variable references", () => {
    const context = {};
    const command = {
      name: "test",
      positionalArgs: [] as string[],
      namedArgs: { config: { type: "variable-ref" as const, name: "missing" } },
    };
    expect(() => resolveCommandArgs(context, command)).toThrow(
      "Variable 'missing' is not defined",
    );
  });
});

describe("Instigator Integration Tests", () => {
  it("should create an instigator and register commands", () => {
    const instigator = createYesod({ name: "test" });

    instigator.register("hello", {
      action: async () => "world",
      description: "Says hello",
    });

    const commands = instigator.getCommands();
    expect(commands["hello"]).toBeDefined();
    expect(commands["hello"]!.description).toBe("Says hello");
  });

  it("should execute a simple command", async () => {
    const instigator = createYesod({ name: "test" });
    let called = false;

    instigator.register("ping", {
      action: async () => {
        called = true;
      },
    });

    await instigator.run(["(ping)"]);
    expect(called).toBe(true);
  });

  it("should pass arguments to commands", async () => {
    const instigator = createYesod({ name: "test" });
    let receivedArgs: { pos: string[]; named: Record<string, string> } | null =
      null;

    instigator.register("echo", {
      action: async (pos, named) => {
        receivedArgs = { pos, named };
      },
    });

    await instigator.run(["(echo hello key:value)"]);
    expect(receivedArgs!).toEqual({
      pos: ["hello"],
      named: { key: "value" },
    });
  });

  it("should handle variable assignment and resolution", async () => {
    const instigator = createYesod({ name: "test" });

    instigator.register("get-value", {
      action: async () => "my-value",
      returns: "string",
    });

    instigator.register("use-value", {
      action: async (_, named) => named.val,
    });

    const result = await instigator.run([
      "x:(get-value)",
      "(use-value val:$x)",
    ]);

    expect(result.x).toBe("my-value");
  });

  it("should throw for unknown commands", async () => {
    const instigator = createYesod({ name: "test" });

    expect(instigator.run(["(unknown-command)"])).rejects.toThrow(
      "Unknown command",
    );
  });

  it("should throw for unassigned return-value commands", async () => {
    const instigator = createYesod({ name: "test" });

    instigator.register("get-config", {
      action: async () => "/path",
      returns: "string",
    });

    expect(instigator.run(["(get-config)"])).rejects.toThrow(
      "must be assigned to a variable",
    );
  });
});
