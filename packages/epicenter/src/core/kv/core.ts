import { regex } from 'arkregex';
import type * as Y from 'yjs';

import type { KvSchema, KvValue, SerializedKvValue } from '../schema';
import { serializeCellValue } from '../schema';

import type { KvHelper, YKvMap } from './kv-helper';
import { createKvHelpers } from './kv-helper';

const KV_KEY_PATTERN = regex('^[a-z][a-z0-9_]*$');

export type { KvHelper } from './kv-helper';

export function createKv<TKvSchema extends KvSchema>(
	ydoc: Y.Doc,
	schema: TKvSchema,
) {
	for (const keyName of Object.keys(schema)) {
		if (keyName.startsWith('$')) {
			throw new Error(
				`KV key "${keyName}" is invalid: cannot start with "$" (reserved for utilities)`,
			);
		}
		if (!KV_KEY_PATTERN.test(keyName)) {
			throw new Error(
				`KV key "${keyName}" is invalid: must start with a lowercase letter and contain only lowercase letters, numbers, and underscores (e.g., "theme", "last_sync", "count2")`,
			);
		}
	}

	const ykvMap = ydoc.getMap<KvValue>('kv') as YKvMap;

	const kvHelpers = createKvHelpers({
		ydoc,
		schema,
		ykvMap,
	});

	return {
		...kvHelpers,

		$all() {
			return Object.values(kvHelpers) as KvHelper<TKvSchema[keyof TKvSchema]>[];
		},

		$toJSON() {
			const result: Record<string, unknown> = {};
			for (const keyName of Object.keys(schema)) {
				const value = ykvMap.get(keyName);
				if (value !== undefined) {
					result[keyName] = serializeCellValue(value);
				} else {
					const helper = kvHelpers[keyName as keyof typeof kvHelpers];
					const getResult = helper.get();
					if (getResult.status === 'valid' && getResult.value !== undefined) {
						result[keyName] = serializeCellValue(getResult.value as KvValue);
					} else {
						result[keyName] = null;
					}
				}
			}
			return result as {
				[K in keyof TKvSchema]: SerializedKvValue<TKvSchema[K]>;
			};
		},

		clearAll(): void {
			ydoc.transact(() => {
				for (const keyName of Object.keys(schema)) {
					ykvMap.delete(keyName);
				}
			});
		},
	};
}

export type Kv<TKvSchema extends KvSchema> = ReturnType<
	typeof createKv<TKvSchema>
>;
