/**
 * createKV() - Lower-level API for binding KV definitions to an existing Y.Doc.
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs';
 * import { createKV, defineKV } from 'epicenter/static';
 * import { type } from 'arktype';
 *
 * const theme = defineKV()
 *   .version(type({ mode: "'light' | 'dark'" }))
 *   .migrate((v) => v);
 *
 * const ydoc = new Y.Doc({ guid: 'my-doc' });
 * const kv = createKV(ydoc, { theme });
 *
 * kv.set('theme', { mode: 'dark' });
 * const result = kv.get('theme');
 * ```
 */

import type * as Y from 'yjs';
import { YKeyValue, type YKeyValueChange } from '../core/utils/y-keyvalue.js';
import type {
	InferKVValue,
	KVDefinition,
	KVDefinitionMap,
	KVGetResult,
	KVHelper,
	ValidationIssue,
} from './types.js';

/**
 * Binds KV definitions to an existing Y.Doc.
 *
 * Creates a KVHelper with dictionary-style access methods.
 * All KV values are stored in a shared Y.Array at `kv`.
 *
 * @param ydoc - The Y.Doc to bind KV to
 * @param definitions - Map of key name to KVDefinition
 * @returns KVHelper with type-safe get/set/delete/observe methods
 */
export function createKV<TKV extends KVDefinitionMap>(
	ydoc: Y.Doc,
	definitions: TKV,
): KVHelper<TKV> {
	// All KV values share a single YKeyValue store
	const yarray = ydoc.getArray<{ key: string; val: unknown }>('kv');
	const ykv = new YKeyValue(yarray);

	/**
	 * Parse and migrate a raw value using the given definition.
	 */
	function parseValue<TValue>(
		raw: unknown,
		definition: KVDefinition<TValue>,
	): KVGetResult<TValue> {
		const result = definition.unionSchema['~standard'].validate(raw);
		if (result instanceof Promise)
			throw new TypeError('Async schemas not supported');

		if (result.issues) {
			return {
				status: 'invalid',
				errors: result.issues as ValidationIssue[],
				raw,
			};
		}

		// Migrate to latest version
		const migrated = definition.migrate(result.value);
		return { status: 'valid', value: migrated };
	}

	return {
		get(key) {
			const definition = definitions[key];
			if (!definition) throw new Error(`Unknown KV key: ${key}`);

			const raw = ykv.get(key);
			if (raw === undefined) {
				return { status: 'not_found' };
			}
			return parseValue(raw, definition as KVDefinition<unknown>);
		},

		set(key, value) {
			if (!definitions[key]) throw new Error(`Unknown KV key: ${key}`);
			ykv.set(key, value);
		},

		delete(key) {
			if (!definitions[key]) throw new Error(`Unknown KV key: ${key}`);
			ykv.delete(key);
		},

		observe(key, callback) {
			const definition = definitions[key];
			if (!definition) throw new Error(`Unknown KV key: ${key}`);

			const handler = (
				changes: Map<string, YKeyValueChange<unknown>>,
				transaction: Y.Transaction,
			) => {
				const change = changes.get(key);
				if (!change) return;

				if (change.action === 'delete') {
					callback({ type: 'delete' }, transaction);
				} else {
					// For add or update, parse and migrate the new value
					const parsed = parseValue(
						change.newValue,
						definition as KVDefinition<unknown>,
					);
					if (parsed.status === 'valid') {
						callback(
							{ type: 'set', value: parsed.value } as Parameters<
								typeof callback
							>[0],
							transaction,
						);
					}
					// Skip callback for invalid values (could add an error callback if needed)
				}
			};

			ykv.on('change', handler);
			return () => ykv.off('change', handler);
		},
	} as KVHelper<TKV>;
}

// Re-export types for convenience
export type { InferKVValue, KVDefinition, KVDefinitionMap, KVHelper };
