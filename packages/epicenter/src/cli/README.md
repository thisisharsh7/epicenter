# Epicenter CLI

Turn your Epicenter workspaces into command-line tools automatically.

## What This Does

The CLI system generates command-line interfaces from your Epicenter configuration. Define your workspaces with their actions, and instantly get a typed, validated CLI that you can run from the terminal.

```bash
epicenter <workspace> <action> [flags]
```

That's it. No manual CLI setup, no repetitive argument parsing. Your workspace actions become commands, and your TypeBox schemas become CLI flags.

## How It Works

### 1. Define Your Workspace Actions

Write your workspace actions like you normally would:

```typescript
import { Type } from 'typebox';

const reddit = defineWorkspace({
  name: 'reddit',
  actions: ({ db }) => ({
    import: defineMutation({
      input: Type.Object({
        url: Type.String({ description: 'Reddit URL to import' }),
        count: Type.Number({ description: 'Number of posts', default: 10 }),
      }),
      handler: async ({ url, count }) => {
        // Your import logic here
        return Ok(result);
      }
    })
  })
});
```

### 2. Create an Epicenter Config

In your project root, create `epicenter.config.ts`:

```typescript
import { defineEpicenter } from '@repo/epicenter';
import { reddit, blog } from './workspaces';

export default defineEpicenter({
  id: 'my-app',
  workspaces: [reddit, blog],
});
```

### 3. Run Commands

The CLI automatically discovers your config and exposes your actions:

```bash
epicenter reddit import --url "https://reddit.com/r/typescript" --count 25
epicenter blog publish --title "My Post" --tags tech typescript coding
```

## Schema-Driven Flags

Your action's input schema automatically becomes CLI flags:

- `Type.String()` → `--flag <value>`
- `Type.Number()` → `--flag <number>`
- `Type.Boolean()` → `--flag` (presence = true)
- `Type.Array(Type.String())` → `--flag item1 item2 item3` (space-separated)
- `Type.Union([Type.Literal('a'), Type.Literal('b')])` → `--flag <choice>` (with validation)
- `Type.Optional()` → flag is optional
- `{ default: value }` in options → flag has a default value
- `{ description: 'text' }` in options → shows in `--help`

**Array values**: Use spaces to separate multiple values:
```bash
epicenter workspace action --tags tech productivity typescript
```

## TypeBox Schema Conversion

The CLI uses TypeBox schemas exclusively. The `typeboxToYargs` function converts TypeBox schemas to yargs CLI options by introspecting the schema structure:

```typescript
// Your TypeBox schema
const schema = Type.Object({
  url: Type.String({ description: 'Reddit URL' }),
  count: Type.Number({ default: 10 }),
});

// Automatically converted to yargs options:
// --url <string> (required) - Reddit URL
// --count <number> (optional, default: 10)
```

The converter works by examining the TypeBox schema's internal structure (`~kind` property) and mapping it to appropriate yargs option types. This happens automatically when you define actions with TypeBox input schemas.

## Under the Hood

When you run a command:

1. **Config Loading**: Finds `epicenter.config.ts` in your project
2. **Schema Introspection**: Examines action schemas to generate flags
3. **Client Creation**: Initializes the epicenter client with all workspaces
4. **Action Execution**: Calls the requested action with parsed arguments
5. **Result Handling**: Displays success data or error messages

The CLI handles Result types from `wellcrafted`, showing errors clearly and exiting with appropriate status codes.

## Error Handling

The CLI provides helpful error messages:

- **Config not found**: Lists expected file names
- **Workspace not found**: Shows available workspaces
- **Action not found**: Lists available actions for that workspace
- **Invalid arguments**: Shows validation errors from your schema
- **Action errors**: Displays error details from Result types

## Testing Your CLI

Test your CLI commands programmatically:

```typescript
import { createCLI } from '@repo/epicenter/cli';

const cli = createCLI(epicenter, {
  argv: ['reddit', 'import', '--url', 'https://...', '--count', '5']
});

await cli.parse(); // Executes the command
```

## Implementation Architecture

### Two-Phase Design

The CLI uses a two-phase approach to balance speed and functionality:

**Phase 1: CLI Setup (Fast - ~10-20ms)**
- Extracts metadata using mock context (no YJS initialization)
- Builds yargs command hierarchy (workspace → action)
- Converts TypeBox schemas to CLI flags
- Enables fast `--help` commands

**Phase 2: Command Execution (On-Demand)**
- Creates real workspace client with YJS docs
- Initializes indexes and dependencies
- Executes action handler
- Cleans up with `await using` disposal

### Mock Context Pattern

To avoid expensive YJS initialization during help/introspection, the CLI uses mock implementations:

```typescript
const mockContext = createMockContext(workspace.schema);
const actions = workspace.actions(mockContext);

// Extract metadata without executing handlers
for (const [name, action] of Object.entries(actions)) {
  console.log(name, action.type, action.input);
}
```

This keeps help commands instant while deferring real initialization until command execution.

### File Organization

- `bin.ts`: Entry point for CLI executable
- `cli.ts`: Core CLI creation logic
- `metadata.ts`: Fast metadata extraction using mocks
- `typebox-to-yargs.ts`: Schema to CLI flag conversion
- `load-config.ts`: Config file discovery and loading
- `mock-context.ts`: Mock db/indexes/workspaces for introspection
- `index.ts`: Public API exports for programmatic use

### Resource Management

The CLI uses explicit resource management (`await using`) to ensure proper cleanup:

```typescript
await using client = await createWorkspaceClient(workspaceConfig);
// Client automatically disposed after execution
```

This prevents resource leaks when running CLI commands.

## Philosophy

Command-line interfaces should be generated, not hand-written. Your workspace actions already define what arguments they accept and what they do. The CLI just exposes that over the terminal.

No boilerplate. No duplication. Just your actions, accessible from the command line.
