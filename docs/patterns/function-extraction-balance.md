# Function Extraction: Finding the Right Balance

There's a tension in code organization: every function should do one thing, but too many layers of abstraction creates exhausting indirection. Here's how I think about finding the balance.

## The Problem

I had this code for building an MCP tool registry:

```typescript
async function buildMcpToolRegistry(client): Promise<Map<string, McpToolEntry>> {
  const actions = [...iterActions(client)];
  const entries = await Promise.all(actions.map(buildToolEntry));
  return new Map(entries.filter((e) => e !== undefined));
}

async function buildToolEntry(info: ActionInfo): Promise<[string, McpToolEntry] | undefined> {
  const toolName = [info.workspaceId, ...info.actionPath].join('_');
  const inputSchema = await buildMcpInputSchema(info.action, toolName);
  if (!inputSchema) return undefined;
  return [toolName, { action: info.action, inputSchema }];
}

async function buildMcpInputSchema(action: Action, toolName: string): Promise<JSONSchema7 | undefined> {
  if (!action.input) return EMPTY_OBJECT_SCHEMA;
  const schema = await safeToJsonSchema(action.input);
  if (schema.type !== 'object' && schema.type !== undefined) {
    console.warn(`[MCP] Skipping tool "${toolName}": input has type "${schema.type}" but MCP requires "object".`);
    return undefined;
  }
  return schema;
}
```

Three functions. Each does "one thing." But is this better than two? One?

## The Heuristic

I ask two questions:

1. **Does the extracted function have real logic, or is it just glue?**
2. **Would inlining it make the parent function unreadable?**

Let's analyze each function:

**`buildToolEntry`** (5 lines): This is pure glue code. It joins strings, calls another function, returns a tuple. No branching logic, no validation, no side effects beyond what it delegates. The name doesn't tell me anything I can't see from the code itself.

**`buildMcpInputSchema`** (12 lines): This has real logic. It handles the empty-input case, validates the schema type, and logs a warning. The warning text alone justifies extraction; it's domain-specific behavior that clutters the main flow.

## The Refactor

Inline `buildToolEntry`, keep the schema function (renamed for clarity):

```typescript
async function buildMcpToolRegistry(client): Promise<Map<string, McpToolEntry>> {
  const entries = await Promise.all(
    [...iterActions(client)].map(async ({ workspaceId, actionPath, action }) => {
      const toolName = [workspaceId, ...actionPath].join('_');
      const inputSchema = await getValidInputSchema(action, toolName);
      if (!inputSchema) return undefined;
      return [toolName, { action, inputSchema }] as const;
    }),
  );

  return new Map(entries.filter((e): e is NonNullable<typeof e> => e !== undefined));
}

async function getValidInputSchema(action: Action, toolName: string): Promise<JSONSchema7 | undefined> {
  if (!action.input) return EMPTY_OBJECT_SCHEMA;
  const schema = await safeToJsonSchema(action.input);
  if (schema.type !== 'object' && schema.type !== undefined) {
    console.warn(
      `[MCP] Skipping tool "${toolName}": input has type "${schema.type}" but MCP requires "object".`
    );
    return undefined;
  }
  return schema;
}
```

Two functions instead of three. The main function is slightly longer but completely readable. The inline callback is 5 lines; that's fine for a map operation.

## When to Extract

Extract a function when:
- It has meaningful branching logic or validation
- It has side effects worth naming (logging, I/O)
- It's reused in multiple places
- The parent function becomes unreadable without extraction

Keep code inline when:
- It's just data transformation (map, join, construct)
- The "function" is 3-5 lines of straight-line code
- Naming it doesn't add information beyond what the code shows
- It's only called in one place

## The Deeper Principle

"One function, one thing" is about mental chunking, not line counts. A function should represent one conceptual step in a process. If that step is "build a tool entry from action info," and building a tool entry is trivial, then it's not worth naming.

The goal is code you can read top-to-bottom without constantly jumping to definitions. Sometimes that means more functions. Sometimes fewer.
