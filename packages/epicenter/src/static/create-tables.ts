/**
 * createTables() - Lower-level API for binding table definitions to an existing Y.Doc.
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs';
 * import { createTables, defineTable } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * const posts = defineTable()
 *   .version(type({ id: 'string', title: 'string' }))
 *   .migrate((row) => row);
 *
 * const ydoc = new Y.Doc({ guid: 'my-doc' });
 * const tables = createTables(ydoc, { posts });
 *
 * tables.posts.set({ id: '1', title: 'Hello' });
 * ```
 */

import type * as Y from 'yjs';
import { YKeyValue } from '../core/utils/y-keyvalue.js';
import { createTableHelper } from './table-helper.js';
import type {
	InferTableRow,
	TableDefinition,
	TableDefinitionMap,
	TableHelper,
	TablesHelper,
} from './types.js';

/**
 * Binds table definitions to an existing Y.Doc.
 *
 * Creates a TablesHelper object with a TableHelper for each table definition.
 * Tables are stored in the Y.Doc under `table:{tableName}` arrays.
 *
 * @param ydoc - The Y.Doc to bind tables to
 * @param definitions - Map of table name to TableDefinition
 * @returns TablesHelper with type-safe access to each table
 */
export function createTables<TTables extends TableDefinitionMap>(
	ydoc: Y.Doc,
	definitions: TTables,
): TablesHelper<TTables> {
	const helpers: Record<string, TableHelper<{ id: string }>> = {};

	for (const [name, definition] of Object.entries(definitions)) {
		// Each table gets its own Y.Array for isolation
		const yarray = ydoc.getArray<{ key: string; val: unknown }>(`table:${name}`);
		const ykv = new YKeyValue(yarray);

		helpers[name] = createTableHelper(
			ykv,
			definition as TableDefinition<{ id: string }>,
		);
	}

	return helpers as TablesHelper<TTables>;
}

// Re-export types for convenience
export type { InferTableRow, TableDefinition, TableDefinitionMap, TablesHelper };
