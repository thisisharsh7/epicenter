# Dependency Testing Examples

Comprehensive examples demonstrating workspace dependency patterns and type safety in Epicenter.

## Structure

```
dependency-testing/
├── users.ts              # Foundation workspace (no dependencies)
├── posts.ts              # Single dependency (users)
├── comments.ts           # Chained dependency (posts → users)
├── analytics.ts          # Multiple dependencies (users, posts, comments)
├── epicenter.config.ts   # Main configuration
├── type-safety-test.ts   # Type safety demonstrations
└── README.md            # This file
```

## Dependency Chain

```
users (no deps)
  ↓
posts (depends on users)
  ↓
comments (depends on posts)
  ↓
analytics (depends on users, posts, comments)
```

## What Each Workspace Demonstrates

### users.ts (Foundation)
- **Dependencies**: None
- **Purpose**: Foundation workspace that others depend on
- **Features**:
  - Basic CRUD operations for user management
  - No `workspaces` parameter in actions
  - Clean, simple workspace structure

### posts.ts (Single Dependency)
- **Dependencies**: `users`
- **Purpose**: Demonstrates single dependency pattern
- **Features**:
  - ✅ Access to `workspaces.users.*` actions
  - ✅ Type-safe cross-workspace queries
  - ✅ Author validation using `workspaces.users.getUser()`
  - ✅ `getPostWithAuthor()` enriches posts with user data

**Key Pattern**:
```typescript
dependencies: [users],

actions: ({ db, indexes, workspaces }) => ({
  getPostWithAuthor: defineQuery({
    handler: async ({ id }) => {
      const post = await indexes.sqlite.db
        .select()
        .from(indexes.sqlite.posts)
        .where(eq(indexes.sqlite.posts.id, id))
        .get();

      // ✅ Type-safe access to users workspace
      const authorResult = await workspaces.users.getUser({
        id: post.authorId
      });

      return Ok({ ...post, author: authorResult.data });
    },
  }),
})
```

### comments.ts (Chained Dependency)
- **Dependencies**: `posts` (which depends on `users`)
- **Purpose**: Tests non-transitive dependency access
- **Features**:
  - ✅ Access to `workspaces.posts.*` actions
  - ❌ **NO** access to `workspaces.users.*` (not a direct dependency)
  - ✅ Indirect access to user data via `workspaces.posts.getPostWithAuthor()`
  - Demonstrates dependency boundaries

**Key Insight**:
```typescript
dependencies: [posts],

actions: ({ db, indexes, workspaces }) => ({
  getCommentWithPost: defineQuery({
    handler: async ({ id }) => {
      // ✅ Can access posts (direct dependency)
      const postResult = await workspaces.posts.getPost({ id: comment.postId });

      // ❌ CANNOT access users directly (not a direct dependency)
      // await workspaces.users.getUser({ id: comment.authorId });
      //                ^^^^^ TypeScript Error: Property 'users' does not exist

      // ✅ But can get user data indirectly through posts
      const postWithAuthor = await workspaces.posts.getPostWithAuthor({
        id: comment.postId,
      });

      return Ok({
        ...comment,
        post: postResult.data,
        author: postWithAuthor.data?.author,
      });
    },
  }),
})
```

### analytics.ts (Multiple Dependencies)
- **Dependencies**: `users`, `posts`, `comments`
- **Purpose**: Demonstrates multiple dependency access
- **Features**:
  - ✅ Access to all three workspaces: `users`, `posts`, `comments`
  - ✅ Cross-workspace aggregation
  - ✅ Full type safety across all dependencies
  - Complex analytics queries combining multiple data sources

**Key Pattern**:
```typescript
dependencies: [users, posts, comments],

actions: ({ db, indexes, workspaces }) => ({
  getUserStats: defineQuery({
    handler: async ({ userId }) => {
      // ✅ Access ALL three dependencies with full type safety
      const userResult = await workspaces.users.getUser({ id: userId });
      const postsResult = await workspaces.posts.getPostsByAuthor({
        authorId: userId
      });
      const commentsResult = await workspaces.comments.getCommentsByAuthor({
        authorId: userId
      });

      return Ok({
        user: userResult.data,
        totalPosts: postsResult.data?.length ?? 0,
        totalComments: commentsResult.data?.length ?? 0,
      });
    },
  }),
})
```

## Type Safety Features

### 1. Autocomplete
All dependency actions have full IntelliSense/autocomplete support:
- `workspaces.users.` → shows all user actions
- `workspaces.posts.` → shows all post actions
- `workspaces.comments.` → shows all comment actions

### 2. Type Inference
Return types from dependency actions are automatically inferred:
```typescript
const userResult = await workspaces.users.getUser({ id: 'user-1' });
// userResult.data has type: { id: string, name: string, email: string, role: ... } | undefined
```

### 3. Compile-time Safety
Invalid dependency access causes TypeScript errors:
```typescript
// In comments workspace:
await workspaces.posts.getPost({ id: 'post-1' });  // ✅ OK
await workspaces.users.getUser({ id: 'user-1' });  // ❌ Error: Property 'users' does not exist
```

### 4. Parameter Validation
Action parameters are type-checked:
```typescript
// ✅ Valid
await workspaces.users.getUsersByRole({ role: 'author' });

// ❌ Error: Type '"invalid"' is not assignable to union type
await workspaces.users.getUsersByRole({ role: 'invalid' });
```

### 5. Non-transitive Access
Dependencies are NOT transitive:
- `comments` depends on `posts`
- `posts` depends on `users`
- But `comments` **cannot** directly access `users`

This enforces clean dependency boundaries and prevents tight coupling.

## Running the Examples

### Load the configuration:
```bash
cd packages/epicenter/examples/dependency-testing
bun --print "import config from './epicenter.config.ts'; console.log('Workspaces:', config.workspaces.map(w => w.id))"
```

### Run type safety tests:
```bash
bun type-safety-test.ts
```

Expected output:
```
✓ Users workspace: No dependencies
✓ Posts workspace: Has users dependency
✓ Comments workspace: Has posts dependency (no transitive access to users)
✓ Analytics workspace: Has users, posts, and comments dependencies
✓ Action parameters: Type-safe
✓ Return types: Properly inferred

✅ All type safety checks passed!
```

## Testing Type Safety in Your IDE

Open any workspace file and try these patterns:

**In posts.ts**:
```typescript
workspaces.users.getUser({ id: 'user-1' });      // ✅ Works
workspaces.comments.getComment({ id: 'c-1' });   // ❌ Error
```

**In comments.ts**:
```typescript
workspaces.posts.getPost({ id: 'post-1' });      // ✅ Works
workspaces.users.getUser({ id: 'user-1' });      // ❌ Error
```

**In analytics.ts**:
```typescript
workspaces.users.getUser({ id: 'user-1' });      // ✅ Works
workspaces.posts.getPost({ id: 'post-1' });      // ✅ Works
workspaces.comments.getComment({ id: 'c-1' });   // ✅ Works
```

## Best Practices Demonstrated

1. **Foundation First**: Start with workspaces that have no dependencies (`users`)
2. **Single Responsibility**: Each workspace manages one domain
3. **Explicit Dependencies**: Only list direct dependencies, not transitive ones
4. **Type-safe Access**: Use `workspaces.name.action()` for cross-workspace queries
5. **Indirect Access**: Access transitive data through intermediate workspaces
6. **Validation**: Use dependency actions to validate references (e.g., verify author exists)

## Key Takeaways

- ✅ Dependencies provide type-safe access to other workspaces
- ✅ Multiple dependencies are fully supported
- ❌ Dependencies are NOT transitive (by design)
- ✅ All action parameters and return types are fully typed
- ✅ TypeScript catches invalid access patterns at compile time
- ✅ IDE autocomplete works perfectly for all workspace actions
