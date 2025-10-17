import * as Y from 'yjs';
import type { Db } from '../db/core';
import type { WorkspaceSchema } from '../core/schema';
import type { WorkspaceActionMap } from '../core/actions';

/**
 * Create a minimal mock Db instance for introspection.
 * Does not connect to real YJS or perform actual operations.
 *
 * This is used to call action factories without expensive initialization,
 * allowing us to extract metadata (action names, schemas) without loading YJS docs.
 */
export function createMockDb<TSchema extends WorkspaceSchema>(
	schema: TSchema,
): Db<TSchema> {
	const emptyYDoc = new Y.Doc();

	// Create proxy that returns no-op functions for all table operations
	const tables = new Proxy(
		{} as any,
		{
			get: (_target, tableName: string) => ({
				insert: () => {},
				update: () => {},
				delete: () => {},
				get: () => ({ status: 'missing' as const }),
				getMany: () => [],
				getAll: () => [],
			}),
		},
	);

	return {
		tables,
		ydoc: emptyYDoc,
		schema,
		transact: (fn: any) => fn(),
	} as Db<TSchema>;
}

/**
 * Create minimal mock indexes object.
 * Returns empty object since we don't need indexes for introspection.
 */
export function createMockIndexes(): Record<string, any> {
	return {};
}

/**
 * Create minimal mock workspaces object.
 * Returns empty object since we don't need dependencies for introspection.
 */
export function createMockWorkspaces(): Record<string, WorkspaceActionMap> {
	return {};
}

/**
 * Create full mock context for a workspace.
 * Use this to call actions factories without real initialization.
 *
 * @example
 * ```typescript
 * const mockContext = createMockContext(workspace.schema);
 * const actions = workspace.actions(mockContext);
 *
 * // Extract metadata without executing handlers
 * for (const [name, action] of Object.entries(actions)) {
 *   console.log(name, action.type, action.input);
 * }
 * ```
 */
export function createMockContext<TSchema extends WorkspaceSchema>(schema: TSchema) {
	return {
		db: createMockDb(schema),
		indexes: createMockIndexes(),
		workspaces: createMockWorkspaces(),
	};
}
