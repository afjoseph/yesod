# Yesod

Lispy Command Runner

## Install

```bash
bun add yesod
```

## Usage

```typescript
import { createYesod } from "yesod"

const ins = createYesod({ name: "myapp" })

// Register commands
ins.register("greet", {
  description: "Say hello",
  argsDescription: ["name: Person to greet"],
  action: async (positional, named) => {
    console.log(`Hello, ${named.name}!`)
  },
})

ins.register("get-env", {
  description: "Get environment config",
  returns: "Config object",
  action: async (positional, named) => {
    return { env: named.env || "dev" }
  },
})

// Run from CLI args
await ins.run(process.argv.slice(2))
```

## DSL Syntax

```bash
# Simple command with named arg
(greet name:world)

# Assign return value to variable
config:(get-env env:prod)

# Chain commands, reference variables
config:(get-env env:prod) (deploy config:$config)

# Discard return value (for commands with `returns`)
_:(get-env)

# Positional args
(deploy prod verbose)
```

## Development

```bash
bun test              # Run tests
bun run check         # Type check + lint
```

## Etymology
- Yesod is Hebrew word for "Foundation"
- It is the 9th Sephira (read: channel) in which the divine energy passes before manifesting in the physical world: Makuth, the 10th Sephira
- It essentially receives abstract intention from above and transmits it downward into concrete form
- I am also a big fan of the name and I'm very happy other [fantastic projects](https://www.yesodweb.com/) found resonance in the same idea
