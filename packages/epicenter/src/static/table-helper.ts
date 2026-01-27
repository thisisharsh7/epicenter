/**
 * TableHelper implementation for versioned table operations.
 *
 * Provides CRUD operations with validation and migration on read.
 */

import type * as Y from 'yjs';
import { YKeyValue } from '../core/utils/y-keyvalue.js';
import { validateWithSchema } from './schema-union.js';
import type {
	DeleteManyResult,
	DeleteResult,
	GetResult,
	InvalidRowResult,
	RowResult,
	TableDefinition,
	TableHelper,
	ValidationIssue,
} from './types.js';

/**
 * Creates a TableHelper for a single table bound to a YKeyValue store.
 */
export function createTableHelper<TRow extends { id: string }>(
	ykv: YKeyValue<unknown>,
	definition: TableDefinition<TRow>,
): TableHelper<TRow> {
	/**
	 * Parse and migrate a raw row value.
	 */
	function parseRow(id: string, raw: unknown): GetResult<TRow> {
		const validation = validateWithSchema(definition.unionSchema, raw);

		if (!validation.success) {
			return {
				status: 'invalid',
				id,
				errors: validation.issues as ValidationIssue[],
				raw,
			};
		}

		// Migrate to latest version
		const migrated = definition.migrate(validation.value);
		return { status: 'valid', row: migrated };
	}

	return {
		// ═══════════════════════════════════════════════════════════════════════
		// WRITE
		// ═══════════════════════════════════════════════════════════════════════

		set(row: TRow): void {
			ykv.set(row.id, row);
		},

		setMany(rows: readonly TRow[]): void {
			for (const row of rows) {
				ykv.set(row.id, row);
			}
		},

		// ═══════════════════════════════════════════════════════════════════════
		// READ
		// ═══════════════════════════════════════════════════════════════════════

		get(id: string): GetResult<TRow> {
			const raw = ykv.get(id);
			if (raw === undefined) {
				return { status: 'not_found', id };
			}
			return parseRow(id, raw);
		},

		getAll(): RowResult<TRow>[] {
			const results: RowResult<TRow>[] = [];
			for (const [key, entry] of ykv.map) {
				const result = parseRow(key, entry.val);
				if (result.status !== 'not_found') {
					results.push(result);
				}
			}
			return results;
		},

		getAllValid(): TRow[] {
			const rows: TRow[] = [];
			for (const [key, entry] of ykv.map) {
				const result = parseRow(key, entry.val);
				if (result.status === 'valid') {
					rows.push(result.row);
				}
			}
			return rows;
		},

		getAllInvalid(): InvalidRowResult[] {
			const invalid: InvalidRowResult[] = [];
			for (const [key, entry] of ykv.map) {
				const result = parseRow(key, entry.val);
				if (result.status === 'invalid') {
					invalid.push({
						id: result.id,
						errors: result.errors,
						raw: result.raw,
					});
				}
			}
			return invalid;
		},

		// ═══════════════════════════════════════════════════════════════════════
		// QUERY
		// ═══════════════════════════════════════════════════════════════════════

		filter(predicate: (row: TRow) => boolean): TRow[] {
			const rows: TRow[] = [];
			for (const [key, entry] of ykv.map) {
				const result = parseRow(key, entry.val);
				if (result.status === 'valid' && predicate(result.row)) {
					rows.push(result.row);
				}
			}
			return rows;
		},

		find(predicate: (row: TRow) => boolean): TRow | undefined {
			for (const [key, entry] of ykv.map) {
				const result = parseRow(key, entry.val);
				if (result.status === 'valid' && predicate(result.row)) {
					return result.row;
				}
			}
			return undefined;
		},

		// ═══════════════════════════════════════════════════════════════════════
		// DELETE
		// ═══════════════════════════════════════════════════════════════════════

		delete(id: string): DeleteResult {
			if (!ykv.has(id)) {
				return { status: 'not_found_locally' };
			}
			ykv.delete(id);
			return { status: 'deleted' };
		},

		deleteMany(ids: readonly string[]): DeleteManyResult {
			const deleted: string[] = [];
			const notFoundLocally: string[] = [];

			for (const id of ids) {
				if (ykv.has(id)) {
					ykv.delete(id);
					deleted.push(id);
				} else {
					notFoundLocally.push(id);
				}
			}

			if (deleted.length === ids.length) {
				return { status: 'all_deleted', deleted };
			}
			if (deleted.length === 0) {
				return { status: 'none_deleted', notFoundLocally };
			}
			return { status: 'partially_deleted', deleted, notFoundLocally };
		},

		clear(): void {
			const keys = Array.from(ykv.map.keys());
			for (const key of keys) {
				ykv.delete(key);
			}
		},

		// ═══════════════════════════════════════════════════════════════════════
		// OBSERVE
		// ═══════════════════════════════════════════════════════════════════════

		observe(
			callback: (changedIds: Set<string>, transaction: unknown) => void,
		): () => void {
			const handler = (
				changes: Map<string, unknown>,
				transaction: Y.Transaction,
			) => {
				callback(new Set(changes.keys()), transaction);
			};

			ykv.on('change', handler as Parameters<typeof ykv.on>[1]);
			return () => ykv.off('change', handler as Parameters<typeof ykv.off>[1]);
		},

		// ═══════════════════════════════════════════════════════════════════════
		// METADATA
		// ═══════════════════════════════════════════════════════════════════════

		count(): number {
			return ykv.map.size;
		},

		has(id: string): boolean {
			return ykv.has(id);
		},
	};
}
