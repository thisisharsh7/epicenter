import { defineEpicenter } from '../../src/index';
import { users } from './users';
import { posts } from './posts';
import { comments } from './comments';
import { analytics } from './analytics';

/**
 * Dependency Testing Example
 *
 * This example demonstrates comprehensive epicenter workspace dependency patterns:
 *
 * ## Workspace Dependency Chain
 * ```
 * users (no workspace deps)
 *   ↓
 * posts (depends on users)
 *   ↓
 * comments (depends on posts)
 *   ↓
 * analytics (depends on users, posts, comments)
 * ```
 *
 * ## What Each Epicenter Tests
 *
 * ### users epicenter
 * - Foundation epicenter with no workspace dependencies
 * - Basic CRUD operations for user management
 *
 * ### posts epicenter (Single Workspace Dependency)
 * - Depends on: users
 * - ✅ Can access workspaces.users.* actions
 * - ✅ Type-safe cross-epicenter queries (getPostWithAuthor)
 * - ✅ Validation using workspace actions (verify author exists)
 *
 * ### comments epicenter (Chained Workspace Dependency)
 * - Depends on: posts (which depends on users)
 * - ✅ Can access workspaces.posts.* actions
 * - ❌ CANNOT access workspaces.users.* directly (not a direct workspace dependency)
 * - ✅ Can access user data indirectly through posts.getPostWithAuthor
 * - Tests non-transitive workspace dependency access
 *
 * ### analytics epicenter (Multiple Workspace Dependencies)
 * - Depends on: users, posts, comments
 * - ✅ Can access workspaces.users.*, workspaces.posts.*, workspaces.comments.*
 * - ✅ Cross-epicenter aggregation and analytics
 * - ✅ Full type safety across all three workspace dependencies
 *
 * ## Type Safety Features Demonstrated
 *
 * 1. **Autocomplete**: All workspace actions have full autocomplete
 * 2. **Type Inference**: Return types from workspace actions are properly inferred
 * 3. **Compile-time Safety**: Invalid workspace access causes TypeScript errors
 * 4. **Parameter Validation**: Action parameters are type-checked
 * 5. **Non-transitive Access**: Chained workspace dependencies don't expose transitive epicenters
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
