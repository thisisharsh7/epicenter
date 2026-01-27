/**
 * KVHelper implementation for versioned KV operations.
 *
 * Provides get/set/observe operations with validation and migration on read.
 */

import type * as Y from 'yjs';
import type { YKeyValue, YKeyValueChange } from '../core/utils/y-keyvalue.js';
import type {
	KVChange,
	KVDefinition,
	KVGetResult,
	KVItemHelper,
	ValidationIssue,
} from './types.js';

/**
 * Creates a KVItemHelper for a single KV key bound to a YKeyValue store.
 *
 * @param ykv - The YKeyValue store (shared across all KV keys)
 * @param key - The key name in the store
 * @param definition - The KV definition with schema versions and migration
 */
export function createKVItemHelper<TValue>(
	ykv: YKeyValue<unknown>,
	key: string,
	definition: KVDefinition<TValue>,
): KVItemHelper<TValue> {
	/**
	 * Parse and migrate a raw value.
	 */
	function parseValue(raw: unknown): KVGetResult<TValue> {
		const result = definition.unionSchema['~standard'].validate(raw);
		if (result instanceof Promise) throw new TypeError('Async schemas not supported');

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
		get(): KVGetResult<TValue> {
			const raw = ykv.get(key);
			if (raw === undefined) {
				return { status: 'not_found' };
			}
			return parseValue(raw);
		},

		set(value: TValue): void {
			ykv.set(key, value);
		},

		delete(): void {
			ykv.delete(key);
		},

		observe(
			callback: (change: KVChange<TValue>, transaction: unknown) => void,
		): () => void {
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
					const parsed = parseValue(change.newValue);
					if (parsed.status === 'valid') {
						callback({ type: 'set', value: parsed.value }, transaction);
					}
					// Skip callback for invalid values (could add an error callback if needed)
				}
			};

			ykv.on('change', handler);
			return () => ykv.off('change', handler);
		},
	};
}
