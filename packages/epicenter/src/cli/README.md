# Epicenter CLI

Turn your Epicenter workspaces into command-line tools automatically.

## What This Does

The CLI system generates command-line interfaces from your Epicenter configuration. Define your workspaces with their actions, and instantly get a typed, validated CLI that you can run from the terminal.

```bash
epicenter <workspace> <action> [flags]
```

That's it. No manual CLI setup, no repetitive argument parsing. Your workspace actions become commands, and your Standard Schema definitions become CLI flags.

## How It Works

### 1. Define Your Workspace Actions

Write your workspace actions like you normally would:

```typescript
import { type } from 'arktype';
import { defineWorkspace, defineMutation } from '@epicenter/hq';

const reddit = defineWorkspace({
	id: 'reddit',
	tables: {
		/* ... */
	},
	actions: ({ tables }) => ({
		import: defineMutation({
			input: type({
				url: 'string',
				count: 'number = 10',
			}).describe({
				url: 'Reddit URL to import',
				count: 'Number of posts',
			}),
			handler: async ({ url, count }) => {
				// Your import logic here
				return Ok(result);
			},
		}),
	}),
});
```

### 2. Create an Epicenter Config

In your project root, create `epicenter.config.ts`:

```typescript
import { reddit } from './workspaces/reddit';
import { blog } from './workspaces/blog';

// Export an array of workspace configurations
export default [reddit, blog];
```

### 3. Run Commands

The CLI automatically discovers your config and exposes your actions:

```bash
epicenter reddit import --url "https://reddit.com/r/typescript" --count 25
epicenter blog publish --title "My Post" --tags tech typescript coding
```

Running `epicenter` without arguments starts an HTTP server with REST and MCP endpoints.

## Schema-Driven Flags

Your action's input schema automatically becomes CLI flags:

- `'string'` → `--flag <value>`
- `'number'` → `--flag <number>`
- `'boolean'` → `--flag` (presence = true)
- `'string[]'` → `--flag item1 item2 item3` (space-separated)
- `'"a" | "b"'` → `--flag <choice>` (with validation)
- `'string?'` → flag is optional
- `'number = 10'` → flag has a default value
- `.describe({})` → shows descriptions in `--help`

**Array values**: Use spaces to separate multiple values:

```bash
epicenter workspace action --tags tech productivity typescript
```

## Standard Schema Conversion

The CLI uses Standard Schema for validation. The `standardJsonSchemaToYargs` function converts Standard Schema definitions to yargs CLI options by introspecting the schema structure:

```typescript
// Your ArkType schema
const schema = type({
	url: 'string',
	'count?': 'number = 10',
}).describe({
	url: 'Reddit URL',
	count: 'Number of posts',
});

// Automatically converted to yargs options:
// --url <string> (required) - Reddit URL
// --count <number> (optional, default: 10)
```

The converter works by examining the Standard Schema's `~standard` property and converting it to JSON Schema, then mapping that to appropriate yargs option types. This works with any Standard Schema-compliant library (ArkType, Valibot, Zod, etc.).

## Under the Hood

When you run a command:

1. **Config Loading**: Finds `epicenter.config.ts` in your project
2. **Client Creation**: Initializes the Epicenter client with all workspaces
3. **Schema Introspection**: Examines action schemas to generate flags
4. **Action Execution**: Calls the requested action with parsed arguments
5. **Result Handling**: Displays success data or error messages

The CLI handles Result types from `wellcrafted`, showing errors clearly and exiting with appropriate status codes.

## Watch Mode

The CLI automatically enables watch mode via `bun --watch`. When you modify your config, workspaces, or any imported files, the CLI restarts automatically. No manual restart needed during development.

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
import { createClient } from '@epicenter/hq';
import { createCLI } from '@epicenter/hq/cli';

const client = await createClient(workspaces, { projectDir: '...' });
await createCLI(client).run([
	'reddit',
	'import',
	'--url',
	'https://...',
	'--count',
	'5',
]);
```

## File Organization

- `bin.ts`: Entry point for CLI executable (with auto-watch mode)
- `cli.ts`: Core CLI creation logic
- `standard-json-schema-to-yargs.ts`: Schema to CLI flag conversion
- `load-config.ts`: Config file discovery and loading
- `index.ts`: Public API exports for programmatic use

## Philosophy

Command-line interfaces should be generated, not hand-written. Your workspace actions already define what arguments they accept and what they do. The CLI just exposes that over the terminal.

No boilerplate. No duplication. Just your actions, accessible from the command line.
