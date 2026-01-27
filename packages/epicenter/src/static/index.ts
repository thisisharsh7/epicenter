/**
 * Static Workspace API for Epicenter
 *
 * A composable, type-safe API for defining and creating workspaces
 * with versioned tables and KV stores.
 *
 * @example
 * ```typescript
 * import { defineWorkspace, defineTable, defineKV } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * // Define schemas with versioning
 * const posts = defineTable()
 *   .version(type({ id: 'string', title: 'string', _v: '"1"' }))
 *   .version(type({ id: 'string', title: 'string', views: 'number', _v: '"2"' }))
 *   .migrate((row) => {
 *     if (row._v === '1') return { ...row, views: 0, _v: '2' as const };
 *     return row;
 *   });
 *
 * const theme = defineKV()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .migrate((v) => v);
 *
 * // Define workspace
 * const workspace = defineWorkspace({
 *   id: 'my-app',
 *   tables: { posts },
 *   kv: { theme },
 * });
 *
 * // Create client (synchronous)
 * const client = workspace.create();
 *
 * // Use tables and KV
 * client.tables.posts.set({ id: '1', title: 'Hello', views: 0, _v: '2' });
 * client.kv.set('theme', { mode: 'dark' });
 *
 * // Cleanup
 * await client.destroy();
 * ```
 *
 * @packageDocumentation
 */

// ════════════════════════════════════════════════════════════════════════════
// Schema Definitions (Pure)
// ════════════════════════════════════════════════════════════════════════════

export { defineTable } from './define-table.js';
export { defineKV } from './define-kv.js';
export { defineWorkspace } from './define-workspace.js';

// ════════════════════════════════════════════════════════════════════════════
// Lower-Level APIs (Bring Your Own Y.Doc)
// ════════════════════════════════════════════════════════════════════════════

export { createTables } from './create-tables.js';
export { createKV } from './create-kv.js';

// ════════════════════════════════════════════════════════════════════════════
// Validation Utilities
// ════════════════════════════════════════════════════════════════════════════

export { createUnionSchema } from './schema-union.js';

// ════════════════════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════════════════════

export type {
	// Result types
	GetResult,
	RowResult,
	InvalidRowResult,
	DeleteResult,
	DeleteManyResult,
	KVGetResult,
	KVChange,
	ValidationIssue,
	// Definition types
	TableDefinition,
	KVDefinition,
	InferTableRow,
	InferKVValue,
	// Helper types
	TableHelper,
	TablesHelper,
	KVHelper,
	// Map types
	TableDefinitionMap,
	KVDefinitionMap,
	// Workspace types
	WorkspaceDefinition,
	WorkspaceClient,
	CapabilityFactory,
	CapabilityMap,
	InferCapabilityExports,
} from './types.js';
