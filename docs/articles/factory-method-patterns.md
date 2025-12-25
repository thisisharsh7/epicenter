# From Dependency Injection to Factory Methods

Refactoring often starts with a feeling of friction. You notice that your function signatures are becoming bloated, your tests are getting harder to write, or your API just doesn't feel "natural" to use. These are signs that your ownership model is backwards.

Here are two patterns for cleaning up resource management and making your APIs more discoverable.

## Pattern 1: Invert Control for Resource Dependencies

When a factory function internally creates and manages its own dependencies, it takes on too much responsibility. It becomes a "god function" that needs to know how to configure everything it touches.

### Before: Internal Management

In this version, `createServer` is responsible for creating the client.

```typescript
// createServer internally creates and manages the client
async function createServer(workspaces, options) {
	const client = await createClient(workspaces, options);
	const app = new Elysia();
	// ... setup routes using client ...
	return { app, client };
}

// Usage: caller has no control over client creation
const { app, client } = await createServer(workspaces, { storageDir: '...' });
```

This approach has several problems:

- **Messy options**: You have to merge `CreateClientOptions` with `CreateServerOptions`, leading to a giant, confusing settings object.
- **Hard to test**: You can't easily inject a mock client because the server insists on creating its own.
- **Inflexible**: You can't reuse an existing client instance across multiple servers or services.
- **Unclear ownership**: It's not obvious who is responsible for closing or cleaning up the client.

### After: Dependency Injection

By passing the already-created client into the server, you separate the "how to initialize" from the "how to use."

```typescript
// createServer takes an already-created client
function createServer(client) {
	const app = new Elysia();
	// ... setup routes using client ...
	return { app };
}

// Usage: caller controls client lifecycle
const client = await createClient(workspaces, { storageDir: '...' });
const { app } = createServer(client);
```

The benefits are immediate:

- **Single responsibility**: `createClient` handles initialization; `createServer` handles wrapping routes.
- **Simpler signatures**: No more merging disparate options objects.
- **Testability**: You can now pass a mock or stub client with zero friction.
- **Explicit lifecycle**: The caller owns the client, so they decide when it starts and stops.

## Pattern 2: When First Argument is a Resource, Make it a Method

Once you've inverted control, you might find yourself with a "service" object and a set of functions that always take that service as their first argument.

### Before: The Awkward First Argument

```typescript
function createServer(client) {
	return { app };
}

function startServer(server, options) {
	Bun.serve({ fetch: server.app.fetch, port: options.port });
	console.log('Server running...');
}

// Usage: awkward - startServer takes server as first arg
const server = createServer(client);
startServer(server, { port: 3913 });
```

This feels like C-style procedural code. You have a "struct" (the server) and you're passing it into every function that needs to operate on it.

### After: The Factory Method

The insight is simple: if a function's first argument is always a specific resource returned by a factory, that function should be a method on the returned object instead.

```typescript
function createServer(client) {
	const app = new Elysia();
	// ... setup ...

	return {
		app,
		start(options) {
			Bun.serve({ fetch: app.fetch, port: options.port });
			console.log('Server running...');
		},
	};
}

// Usage: natural method call
const server = createServer(client);
server.start({ port: 3913 });
```

Why this is better:

- **Discoverable API**: Your IDE's autocomplete will show `.start()` the moment you type `server.`. You don't have to go searching for which `startServer` function to import.
- **Encapsulation**: The `start` method has direct access to the `app` instance without having to pass it around.
- **Fluent interface**: It reads like a thought: "Server, start with these options."

## The General Rule

If you find yourself writing:

```typescript
doSomething(resource, options);
```

Ask yourself: "Is `resource` always created by a specific factory?"

If the answer is yes, refactor your factory to return an object where that function is a method:

```typescript
const resource = createResource();
resource.doSomething(options);
```

This transition from "functions that take resources" to "resources with methods" is the key to building APIs that feel integrated and easy to navigate. It moves the complexity of "how things work together" inside the factory, leaving the consumer with a clean, object-oriented interface.
