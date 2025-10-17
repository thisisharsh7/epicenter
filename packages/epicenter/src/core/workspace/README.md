# Workspace Dependencies

When you have workspaces that depend on other workspaces, you hit a type recursion problem. If workspace A depends on B, which depends on C, which depends on D, and TypeScript tries to preserve full type information at every level, the type system eventually gives up with "Type instantiation is excessively deep and possibly infinite."

To solve this, Epicenter uses a three-tier type system that provides full type information where you need it most (your direct dependencies), while gracefully degrading to minimal constraints for deeper levels.

## The Three Tiers

```
Root Workspace (WorkspaceConfig<TSchema>)
│
├── Direct Dependency (ImmediateDependencyWorkspaceConfig<TSchema>)
│   │   • Full type information
│   │   • Access to all queries, mutations, subscriptions
│   │   • Can access its dependencies
│   │
│   └── Transitive Dependency (DependencyWorkspaceConfig)
│       │   • Minimal constraint: just core workspace interface
│       │   • Actions and schema are typed, but not fully expanded
│       │
│       └── Further Dependencies (DependencyWorkspaceConfig)
│           └── And so on... (DependencyWorkspaceConfig)
│
└── Another Direct Dependency (ImmediateDependencyWorkspaceConfig<TSchema>)
    └── Its transitive dependency (DependencyWorkspaceConfig)
```

## How It Works

**At compile time**: The type system gives you two levels of full type information. Your workspace knows everything about its direct dependencies, and those dependencies know everything about *their* direct dependencies. Beyond that, TypeScript just knows "this is a workspace with the core interface." This works because in Epicenter, all transitives dependencies must be explicitly listed in the root level anyway.

**At runtime**: There's no hierarchy at all. Dependencies are resolved flat with hoisting, just like npm. When you access `deps.foo.deps.bar.deps.baz`, you're traversing a flat map of workspace instances, not a nested tree.

## The Trade-off

You get rich autocomplete and type safety for:
- Your workspace's queries, mutations, and subscriptions
- Your direct dependencies' queries, mutations, and subscriptions
- Your direct dependencies' direct dependencies (one more level)

Beyond that, you can still access deeper dependencies, but TypeScript treats them as "some workspace" rather than providing specific type information about their actions and schema.

In practice, this is rarely a limitation. You typically interact most heavily with your direct dependencies. If you find yourself reaching three or four levels deep into a dependency chain, that's often a signal to restructure your workspace relationships.

## Example

```typescript
// Given this dependency chain:
// root -> auth -> database -> connection-pool

// In your root workspace:
const workspace = defineWorkspace({
  schema: t.Object({ /* ... */ }),
  dependencies: {
    auth: authWorkspace, // ImmediateDependencyWorkspaceConfig
  },
});

// Full type information available:
workspace.deps.auth.query({ action: 'verifyToken', input: { token: 'abc' } });
// TypeScript knows all of auth's actions

// Still has type information:
workspace.deps.auth.deps.database.query({ action: 'getUser', input: { id: 123 } });
// TypeScript knows database's actions too

// Minimal constraint (but still works at runtime):
workspace.deps.auth.deps.database.deps.connectionPool.query({
  action: 'getConnection',
  input: {}
});
// TypeScript just knows this is "some workspace" with query/mutation/subscribe methods
// Autocomplete won't show specific actions, but the code runs fine
```

## When This Matters

This system is mostly invisible until you:
1. Have deeply nested workspace dependencies (3+ levels)
2. Need autocomplete for actions in transitive dependencies
3. See type errors about "Type instantiation is excessively deep"

If you hit case 2, consider whether you should add that workspace as a direct dependency instead of reaching through the chain. If you hit case 3, the three-tier system should prevent it automatically.
