# Epicenter CLI

Turn your Epicenter workspaces into command-line tools automatically.

## What This Does

The CLI system generates command-line interfaces from your Epicenter configuration. Define your workspaces with their actions, and instantly get a typed, validated CLI that you can run from the terminal.

```bash
epicenter <workspace> <action> [flags]
```

That's it. No manual CLI setup, no repetitive argument parsing. Your workspace actions become commands, and your Zod/Arktype schemas become CLI flags.

## How It Works

### 1. Define Your Workspace Actions

Write your workspace actions like you normally would:

```typescript
const reddit = defineWorkspace({
  name: 'reddit',
  actions: ({ db }) => ({
    import: defineMutation({
      input: z.object({
        url: z.string().describe('Reddit URL to import'),
        count: z.number().default(10).describe('Number of posts'),
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

- `z.string()` → `--flag <value>`
- `z.number()` → `--flag <number>`
- `z.boolean()` → `--flag` (presence = true)
- `z.array(z.string())` → `--flag item1 item2 item3` (space-separated)
- `z.enum(['a', 'b'])` → `--flag <choice>` (with validation)
- `.optional()` → flag is optional
- `.default(value)` → flag has a default value
- `.describe('text')` → shows in `--help`

**Array values**: Use spaces to separate multiple values:
```bash
epicenter workspace action --tags tech productivity typescript
```

## Schema Converters

The CLI supports multiple schema libraries through converters:

**Zod** (built-in): Introspects Zod schemas using `._def` and `.shape`.

**Arktype** (built-in): Introspects Arktype schemas using `.json` property.

Want to add support for another schema library? Create a converter:

```typescript
import { createSchemaConverter } from '@repo/epicenter/cli';

const myConverter = createSchemaConverter({
  condition: (schema) => {
    // Check if this is your schema type
    return schema instanceof MySchema;
  },
  convert: (schema, yargs) => {
    // Extract fields and add them as yargs options
    for (const [key, field] of schema.fields) {
      yargs.option(key, { type: field.type });
    }
    return yargs;
  }
});

// Use your converter
createCLI(epicenter, {
  schemaConverters: [myConverter, createZodConverter()],
});
```

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

## Philosophy

Command-line interfaces should be generated, not hand-written. Your workspace actions already define what arguments they accept and what they do. The CLI just exposes that over the terminal.

No boilerplate. No duplication. Just your actions, accessible from the command line.
