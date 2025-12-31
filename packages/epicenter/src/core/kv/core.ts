import type * as Y from 'yjs';

import { defineMutation } from '../actions';
import type { KvSchema, KvValue, SerializedKvValue } from '../schema';
import { serializeCellValue } from '../schema';

import type { KvHelper, YKvMap } from './kv-helper';
import { createKvHelpers } from './kv-helper';

const KV_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

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

		const columnSchema = schema[keyName];
		if (columnSchema.type === 'id') {
			throw new Error(
				`KV key "${keyName}" uses "id()" column type, which is not allowed in KV schemas. Use text(), integer(), or other value types instead.`,
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
					const defaultVal = helper.get.handler(undefined);
					result[keyName] =
						defaultVal !== undefined
							? serializeCellValue(defaultVal as KvValue)
							: null;
				}
			}
			return result as {
				[K in keyof TKvSchema]: SerializedKvValue<TKvSchema[K]>;
			};
		},

		clearAll: defineMutation({
			description: 'Clear all KV values in the workspace',
			handler: () => {
				ydoc.transact(() => {
					for (const keyName of Object.keys(schema)) {
						ykvMap.delete(keyName);
					}
				});
			},
		}),
	};
}

export type Kv<TKvSchema extends KvSchema> = ReturnType<
	typeof createKv<TKvSchema>
>;
