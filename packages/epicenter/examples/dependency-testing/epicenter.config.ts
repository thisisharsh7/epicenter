import { defineEpicenter } from '../../src/index';
import { users } from './users';
import { posts } from './posts';
import { comments } from './comments';
import { analytics } from './analytics';

/**
 * Dependency Testing Example
 *
 * This example demonstrates comprehensive workspace dependency patterns:
 *
 * ## Dependency Chain
 * ```
 * users (no deps)
 *   ↓
 * posts (depends on users)
 *   ↓
 * comments (depends on posts)
 *   ↓
 * analytics (depends on users, posts, comments)
 * ```
 *
 * ## What Each Workspace Tests
 *
 * ### users workspace
 * - Foundation workspace with no dependencies
 * - Basic CRUD operations for user management
 *
 * ### posts workspace (Single Dependency)
 * - Depends on: users
 * - ✅ Can access workspaces.users.* actions
 * - ✅ Type-safe cross-workspace queries (getPostWithAuthor)
 * - ✅ Validation using dependency actions (verify author exists)
 *
 * ### comments workspace (Chained Dependency)
 * - Depends on: posts (which depends on users)
 * - ✅ Can access workspaces.posts.* actions
 * - ❌ CANNOT access workspaces.users.* directly (not a direct dependency)
 * - ✅ Can access user data indirectly through posts.getPostWithAuthor
 * - Tests non-transitive dependency access
 *
 * ### analytics workspace (Multiple Dependencies)
 * - Depends on: users, posts, comments
 * - ✅ Can access workspaces.users.*, workspaces.posts.*, workspaces.comments.*
 * - ✅ Cross-workspace aggregation and analytics
 * - ✅ Full type safety across all three dependencies
 *
 * ## Type Safety Features Demonstrated
 *
 * 1. **Autocomplete**: All dependency actions have full autocomplete
 * 2. **Type Inference**: Return types from dependency actions are properly inferred
 * 3. **Compile-time Safety**: Invalid dependency access causes TypeScript errors
 * 4. **Parameter Validation**: Action parameters are type-checked
 * 5. **Non-transitive Access**: Chained dependencies don't expose transitive workspaces
 *
 * ## Testing the Examples
 *
 * To verify type safety, try these in your IDE:
 *
 * ```typescript
 * // In posts.ts:
 * workspaces.users.getUser({ id: 'user-1' }); // ✅ Works
 * workspaces.comments.getComment({ id: 'comment-1' }); // ❌ Error: Property 'comments' does not exist
 *
 * // In comments.ts:
 * workspaces.posts.getPost({ id: 'post-1' }); // ✅ Works
 * workspaces.users.getUser({ id: 'user-1' }); // ❌ Error: Property 'users' does not exist
 *
 * // In analytics.ts:
 * workspaces.users.getUser({ id: 'user-1' }); // ✅ Works
 * workspaces.posts.getPost({ id: 'post-1' }); // ✅ Works
 * workspaces.comments.getComment({ id: 'comment-1' }); // ✅ Works
 * ```
 */
export default defineEpicenter({
	id: 'dependency-testing',
	workspaces: [users, posts, comments, analytics],
});
