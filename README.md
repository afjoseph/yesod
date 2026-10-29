# Yesod

Lispy Command Orchestration Framework

## Install

    yarn add yesod@github:afjoseph/yesod

Be mindful that Yesod ships the typescript sources, so make sure to run your
app through [tsx](https://github.com/privatenumber/tsx), or feel free to add
something to your package.json to compile to JS

## Usage

    import * as yesod from "yesod"

    await yesod.main({
        commands: {
          greet: {
            description: "Say hello",
            argsDescription: ["name: Person to greet"],
            action: async (positional, named) => {
                console.log(`Hello, ${named.name} xD xD`)
            },
          },
        },
        // Do something before any command run
        onInit: async () => {},
        // Do something right after all commands run
        onExit: (ctx: yesod.OnExitContext) => {},
    })

## DSL Syntax

    // Simple command with named arg
    (greet name:world)

    // Assign return value to variable
    config:(get-env env:prod)

    // Chain commands, reference variables
    config:(get-env env:prod) (deploy config:$config)

    // Discard return value (for commands with `returns`)
    _:(get-env)

    // Positional args
    (deploy prod verbose)

## Development

    // Check syntax
    yarn run check

    // Run tests
    yarn test

## Etymology

- Yesod is Hebrew word for "Foundation"
- It is the 9th Sephira (read: channel) in which the divine energy passes
  before manifesting in the physical world: Makuth, the 10th Sephira
- It essentially receives abstract intention from above and transmits it
  downward into concrete form
- I am also a big fan of the name and I'm very happy other [fantastic
  projects](https://www.yesodweb.com/) found resonance in the same idea
