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
import { YKeyValue } from '../core/utils/y-keyvalue.js';
import { createKVItemHelper } from './kv-helper.js';
import type {
	InferKVValue,
	KVDefinition,
	KVDefinitionMap,
	KVHelper,
	KVItemHelper,
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

	// Create internal helpers for each key
	const helpers: Record<string, KVItemHelper<unknown>> = {};

	for (const [name, definition] of Object.entries(definitions)) {
		helpers[name] = createKVItemHelper(
			ykv,
			name,
			definition as KVDefinition<unknown>,
		);
	}

	// Return dictionary-style API
	return {
		get(key) {
			const helper = helpers[key];
			if (!helper) throw new Error(`Unknown KV key: ${key}`);
			return helper.get();
		},

		set(key, value) {
			const helper = helpers[key];
			if (!helper) throw new Error(`Unknown KV key: ${key}`);
			helper.set(value);
		},

		delete(key) {
			const helper = helpers[key];
			if (!helper) throw new Error(`Unknown KV key: ${key}`);
			helper.delete();
		},

		observe(key, callback) {
			const helper = helpers[key];
			if (!helper) throw new Error(`Unknown KV key: ${key}`);
			return helper.observe(
				callback as Parameters<KVItemHelper<unknown>['observe']>[0],
			);
		},
	} as KVHelper<TKV>;
}

// Re-export types for convenience
export type { InferKVValue, KVDefinition, KVDefinitionMap, KVHelper };
