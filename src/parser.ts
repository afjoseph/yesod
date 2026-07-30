import peggy from "peggy";
import * as fs from "fs";
import * as path from "path";

// A variable reference in the DSL, e.g., $myVar
export type ReferencedVariable = {
  type: "variable-ref";
  name: string;
};

// ArgumentValue can be a literal string or a reference to a variable
export type ArgumentValue = string | ReferencedVariable;

// A variable assignment whose RHS is a command expression
// Example: cfg:(get-config env:prod)
// Stores the result of get-config in the variable "cfg"
export interface VariableAssignment {
  type: "assignment";
  variableName: string;
  command: Command;
}

// A variable assignment whose RHS is a literal value (string or variable ref)
// Example: hahaha:"/path/to/myhahaha"
// Example: home:$HOME
// Stores the resolved string in the variable; no command runs
export interface LiteralAssignment {
  type: "literal-assignment";
  variableName: string;
  value: ArgumentValue;
}

// A standalone command execution
// Example: (deploy service:api)
export interface ExecutableCommand {
  type: "command";
  command: Command;
}

export interface Command {
  name: string;
  positionalArgs: ArgumentValue[];
  namedArgs: Record<string, ArgumentValue>;
}

// A statement is one of:
// - VariableAssignment    (var:(cmd ...))
// - LiteralAssignment     (var:"value", var:stuff, var:$ref)
// - ExecutableCommand     ((cmd ...))
export type Statement =
  | VariableAssignment
  | LiteralAssignment
  | ExecutableCommand;

// Cached parser instance
// Lazily initialized on first use
let parser: peggy.Parser | null = null;

// Path to the bundled grammar file
const grammarPath = path.join(import.meta.dirname, "grammar.pegjs");

// Initialize the parser with the bundled grammar
// This is called automatically on first tokenize() call
function ensureParser(): peggy.Parser {
  if (!parser) {
    const grammarContent = fs.readFileSync(grammarPath, "utf8");
    parser = peggy.generate(grammarContent);
  }
  return parser;
}

// Initialize the parser with a custom grammar file
// Use this if you want to override the default grammar
export function initParserWithGrammar(grammarFilePath: string): void {
  const grammarContent = fs.readFileSync(grammarFilePath, "utf8");
  parser = peggy.generate(grammarContent);
}

// Parse a command string into an array of statements
// Throws an error with location info if parsing fails
//
// Example input: 'cfg:(get-config env:prod) (deploy config:$cfg)'
// Example output: [
//   { type: "assignment", variableName: "cfg", command: { name: "get-config", ... } },
//   { type: "command", command: { name: "deploy", ... } }
// ]
export function tokenize(args: string): Statement[] {
  const p = ensureParser();

  if (!args || args.length === 0) {
    return [];
  }

  try {
    return p.parse(args);
  } catch (e) {
    const error = e as peggy.GrammarError;
    let message = `Failed to parse command: ${error.message}`;
    if (error.location) {
      message += ` at line ${error.location.start.line}, column ${error.location.start.column}`;
    }
    throw new Error(message, { cause: e });
  }
}

// Resolve a single ArgumentValue against the global context
// - String literal -> returned as-is
// - Variable reference -> looked up in context, falling back to process.env
//   - Throws if neither resolves
//
// Example:
//   resolveArgumentValue({ cfg: "/etc/x" }, { type: "variable-ref", name: "cfg" })
//   -> "/etc/x"
//   resolveArgumentValue({}, "literal")
//   -> "literal"
//   resolveArgumentValue({}, { type: "variable-ref", name: "HOME" })
//   -> process.env.HOME (if set), else throws
export function resolveArgumentValue(
  context: Record<string, any>,
  arg: ArgumentValue,
): string {
  if (typeof arg === "string") {
    return arg;
  }
  if ((arg as ReferencedVariable).type === "variable-ref") {
    const varRef = arg as ReferencedVariable;
    const value =
      varRef.name in context ? context[varRef.name] : process.env[varRef.name];
    if (value === undefined) {
      throw new Error(`Variable '${varRef.name}' is not defined`);
    }
    return String(value);
  }
  throw new Error(`Unknown argument type: ${JSON.stringify(arg)}`);
}

// Resolve variable references in command arguments using the global context
// Returns resolved arguments as plain strings
//
// Example:
//   globalContext = { cfg: "/path/to/config.json" }
//   command.namedArgs = { config: { type: "variable-ref", name: "cfg" } }
//   Result: { resolvedNamedArgs: { config: "/path/to/config.json" } }
export function resolveCommandArgs(
  globalContext: Record<string, any>,
  command: Command,
): {
  resolvedPositionalArgs: string[];
  resolvedNamedArgs: Record<string, string>;
} {
  // Resolve positional arguments
  const resolvedPositionalArgs = command.positionalArgs.map((posArg) =>
    resolveArgumentValue(globalContext, posArg),
  );

  // Resolve named arguments
  const resolvedNamedArgs: Record<string, string> = {};
  for (const [key, namedArg] of Object.entries(command.namedArgs)) {
    resolvedNamedArgs[key] = resolveArgumentValue(globalContext, namedArg);
  }

  return {
    resolvedPositionalArgs,
    resolvedNamedArgs,
  };
}
