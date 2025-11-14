# Workspace Exports Pattern

## Overview
Extend workspaces to support exporting anything (not just actions), similar to how indexes work with `IndexExports`. Actions get special treatment (API/MCP mapping), while other exports are accessible directly through the client.

## Problem
Currently, workspaces can only export actions (queries and mutations). This limits flexibility when you want to share utilities, constants, or helper functions that don't need to be API endpoints.

## Solution
Mirror the `IndexExports` pattern:
- Workspaces can export anything via a new `WorkspaceExports` type
- Actions are identified at runtime via type guards (`isAction`, `isQuery`, `isMutation`)
- Only actions get mapped to API endpoints and MCP tools
- Everything else passes through as regular properties on `client.workspaces.{name}.{export}`

## Changes

### 1. Add to `packages/epicenter/src/core/actions.ts`

#### New Types
- `WorkspaceExports`: `Record<string, unknown>` (the broader concept)
- Keep existing `WorkspaceActionMap`: `Record<string, Action<any, any>>` (actions subset)

#### New Functions
- `isAction(value: unknown): value is Action` - Type guard to detect actions
- `isQuery(value: unknown): value is Query` - Type guard to detect queries
- `isMutation(value: unknown): value is Mutation` - Type guard to detect mutations
- `extractActions(exports: WorkspaceExports): WorkspaceActionMap` - Filter just actions
- `defineWorkspaceExports<T>(exports: T): T` - Identity function for type inference

## Usage Example

```typescript
// In workspace definition
const workspace = defineWorkspace({
  actions: () => ({
    // Actions - auto-mapped to API/MCP
    getUser: defineQuery({
      handler: async () => { ... }
    }),

    createUser: defineMutation({
      input: userSchema,
      handler: async (input) => { ... }
    }),

    // Utilities - accessible but not auto-mapped
    validateEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),

    // Constants
    constants: {
      MAX_USERS: 1000,
      DEFAULT_ROLE: 'user'
    },

    // Helpers
    formatters: {
      formatUserName: (user) => `${user.firstName} ${user.lastName}`
    }
  })
});

// API/MCP mapper usage
const actions = extractActions(workspaceExports);
// actions = { getUser, createUser } only

// Client usage
client.workspaces.users.getUser() // Action
client.workspaces.users.validateEmail("test@test.com") // Utility
client.workspaces.users.constants.MAX_USERS // Constant
```

## Benefits
1. **Flexibility**: Export anything, not just actions
2. **Type Safety**: Full TypeScript inference on all exports
3. **Automatic Mapping**: Actions identified by their `type` property and auto-mapped
4. **Direct Access**: Non-action exports accessible as regular properties
5. **Consistent Pattern**: Mirrors the proven `IndexExports` pattern

## Implementation Phases

### Phase 1: Add Workspace Exports Infrastructure ✅
- [x] Add `WorkspaceExports` type to `actions.ts`
- [x] Add type guard functions (`isAction`, `isQuery`, `isMutation`)
- [x] Add `extractActions()` helper function
- [x] Add `defineWorkspaceExports()` helper function
- [x] Update `WorkspaceActionMap` JSDoc to clarify relationship to `WorkspaceExports`

### Phase 2: Rename "actions" to "exports" (Next)
Once Phase 1 is verified, rename the workspace property from "actions" to "exports" throughout the codebase:

**Conceptual Changes**:
- Workspace property: `actions: () => { ... }` → `exports: () => { ... }`
- Documentation: Emphasize that workspaces export both actions and utilities
- Terminology: "Actions" remains valid for things wrapped with `defineQuery`/`defineMutation`
- Functionality: Actions (queries/mutations) get auto-mapped to MCP and API endpoints
- Everything else: Accessible via type-safe client for scripting and utilities

**Files to Update**:
- Workspace definition interfaces
- All workspace configuration files
- Documentation and examples
- Type definitions that reference "actions"
- Comments and JSDoc that refer to the "actions" property

**Strategy**:
1. Update type definitions first
2. Update workspace implementations
3. Update documentation
4. Verify all imports and references

## Review - Phase 1

### What Changed
Added the infrastructure to support flexible workspace exports while maintaining backward compatibility with action-only exports.

**New Types** (`packages/epicenter/src/core/actions.ts:5-67`):
- `WorkspaceExports`: The broader type for any workspace exports
- Updated `WorkspaceActionMap` JSDoc: Clarified it's a subset of `WorkspaceExports`

**Type Guards** (`packages/epicenter/src/core/actions.ts:415-453`):
- `isAction()`: Identifies actions by checking for `type: 'query' | 'mutation'`
- `isQuery()`: Identifies query actions specifically
- `isMutation()`: Identifies mutation actions specifically

**Helper Functions** (`packages/epicenter/src/core/actions.ts:483-515`):
- `extractActions()`: Filters `WorkspaceExports` to just the actions for API/MCP mapping
- `defineWorkspaceExports()`: Identity function for type inference (mirrors `defineIndexExports`)

### Design Decisions
1. **Pattern Consistency**: Mirrors the proven `IndexExports` pattern exactly
2. **Runtime Detection**: Type guards use the `type` property already attached by `defineQuery`/`defineMutation`
3. **Type Safety**: Full TypeScript inference maintained through generics
4. **Backward Compatible**: Existing `WorkspaceActionMap` unchanged, just documented as a subset
5. **Clear Separation**: Actions get auto-mapped; everything else passes through as properties

### Next Steps
Ready to proceed to Phase 2: Renaming "actions" property to "exports" across the codebase.
