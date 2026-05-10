// Peggy.js Grammar for Yesod Commands
//
// This grammar defines a Lisp-like S-expression syntax for command execution
// with variable binding support. We use lisp because https://xkcd.com/297/
// and because the author never finished school where they teach you that
// humanity has moved on from lisp
//
// ## Basic Commands
// All commands are enclosed by parentheses
// The first element is the command name, followed by arguments
//
//    (list-files)
//
//    // Arguments can be positional or named
//    (list-files /path/to/dir)
//
//    // Named arguments are specified as key-value pairs, separated by a colon
//    (list-files /path/to/dir recursive:true)
//
//    // Order is not important
//
// ## Variable Assignments
// Assign the output of a command to a variable using the variable-name: syntax
// The command to be executed must still be in parentheses
//
//     // Assigns the output of `get-config` to the `config` variable, then use
//     // it in the `deploy` command
//     config:(get-config env:production) \
//     (deploy service:api-gateway config:$config)
//
// If a command is defined with a "returns" variable, a variable must be returned,
// or the script won't compile. If you want to set a whatever variable that's never used
// do this:
//
//    _:(db-new-dashuser
//      env:production
//      password:whatever
//    )
//
// ## Literal Assignments
// The right-hand side of `:` can also be a literal value (quoted string,
// bareword, or variable reference). The runner resolves it once and stores
// the resulting string in the global context, just like a command-result
// assignment.
//
//     myawesomevar:"/Users/afjoseph/dev/own/llvm19.0.0"
//     (foo:build llvm-path:$myawesomevar)
//     (foo:test  llvm-path:$myawesomevar)
//
//     // Bareword form (no spaces, no special chars)
//     env:production
//
//     // Forwarding another variable or env var
//     home:$HOME
//
// ## Strings and Quoting
// For arguments that contain spaces or special characters, enclose them in
// double quotes ""
//
//     (echo "My name is Inigo Montoya")
//     (echo "You killed my \"father\"")
//     (echo "Prepare to die")

{
  // Helper to build a command object from parsed parts
  // It separates arguments into positional and named buckets
  function buildCommand(name, args) {
    const command = {
      name: name,
      positionalArgs: [],
      namedArgs: {}
    };
    if (args) {
        args.forEach(arg => {
            if (arg.type === 'positional') {
                command.positionalArgs.push(arg.value);
            } else if (arg.type === 'named') {
                command.namedArgs[arg.name] = arg.value;
            }
        });
    }
    return command;
  }
}

// The entry point: a program is a sequence of statements
Program = _ statements:Statement* _ { return statements; }

// Comment rule that matches double-slash comments until end of line
// For example: // This is a comment
// Double-slashes were chosen because they are the superior
// form of commenting (C++ FTW!). That being said, hashtags work just the same
//
// Comments can appear anywhere whitespace is allowed
Comment = ("//" / "#") [^\n\r]*

// A statement is either a variable assignment or a regular command
Statement = Assignment / ExecutableCommand

// A command expression wrapped in parentheses, which is the core executable unit
CommandExpression = "(" _ command:Command _ ")" { return command; }

// Rule for variable assignments
// RHS can be a command expression (myVar:(command ...)) or a literal value
// (myVar:"some string", myVar:stuff, myVar:$other)
// PEG tries CommandAssignment first; it requires `(` after `:`, so any other
// RHS falls through to LiteralAssignment unambiguously
Assignment = CommandAssignment / LiteralAssignment

// Assignment whose RHS is a command expression
// Example: cfg:(get-config env:prod)
CommandAssignment = variable:Identifier ":" _ command:CommandExpression _ {
  return {
    type: 'assignment',
    variableName: variable,
    command: command
  };
}

// Assignment whose RHS is a literal value (quoted/unquoted string or $varRef)
// Example: hahaha:"/path/to/myhahahah"
// Example: env:production
// Example: home:$HOME
LiteralAssignment = variable:Identifier ":" _ value:Value _ {
  return {
    type: 'literal-assignment',
    variableName: variable,
    value: value
  };
}

// Rule for a standard executable command
// Consumes trailing whitespace
ExecutableCommand = command:CommandExpression _ {
  return {
    type: 'command',
    command: command
  };
}

// A command consists of a name followed by zero or more arguments
// The name can include colons for namespaced commands like "server1:deploy"
Command = name:CommandName args:(_ Argument)* {
  return buildCommand(name, args.map(arg => arg[1]));
}

// An argument can be named (key:value) or positional (value)
Argument = NamedArgument / PositionalArgument

// A positional argument is simply a value
PositionalArgument = value:Value {
  return { type: 'positional', value: value };
}

// A named argument has an identifier, a colon, and a value
NamedArgument = name:Identifier ":" value:Value {
  return { type: 'named', name: name, value: value };
}

// A value can be a variable reference ($var) or a literal string
Value = VariableReference / Literal

// A variable reference, e.g., $myVar
VariableReference = "$" name:Identifier {
  return { type: 'variable-ref', name: name };
}

// A literal can be a quoted string or an unquoted word
Literal = QuotedString / UnquotedString

// An identifier for command/variable names
// Avoids special characters like ':', '(', ')', '$', and whitespace
Identifier = chars:[a-zA-Z0-9_-]+ { return chars.join(''); }

// A command name can include colons in addition to normal identifier characters
// This allows namespaced commands like "server1:deploy" or "db:migrate"
CommandName = chars:[a-zA-Z0-9_:-]+ { return chars.join(''); }

// An unquoted string is any sequence of characters that are not delimiters
UnquotedString = chars:[^ \t\n\r:()$]+ { return chars.join(''); }

// A double-quoted string that properly handles escaped quotes (\")
QuotedString = '"' chars:([^"\\] / "\\".)* '"' {
  // Join the characters, un-escaping any escaped characters
  // An escaped character (e.g., \") is parsed as an array ['\\', '"']
  // We just need the second element from such arrays
  return chars.map(char => {
    if (Array.isArray(char)) {
      return char[1]; // Return the escaped character (e.g., '"' from ['\\', '"'])
    }
    return char; // Return the regular character
  }).join('');
}

// Whitespace, line continuations, and comments
_ = ([ \t\n\r] / "\\" "\n" / Comment)*
