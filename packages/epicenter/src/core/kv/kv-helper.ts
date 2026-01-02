import * as Y from 'yjs';

import type {
	KvFieldSchema,
	KvSchema,
	KvValue,
	SerializedKvValue,
} from '../schema';
import {
	isDateWithTimezoneString,
	isNullableFieldSchema,
	serializeCellValue,
} from '../schema';
import { updateYArrayFromArray, updateYTextFromString } from '../utils/yjs';

export type YKvMap = Y.Map<KvValue>;

/**
 * Creates a collection of typed KV helpers for all keys in a schema.
 *
 * Each key in the schema gets its own helper with get/set operations
 * that handle YJS synchronization and type validation.
 */
export function createKvHelpers<TKvSchema extends KvSchema>({
	ydoc,
	schema,
	ykvMap,
}: {
	ydoc: Y.Doc;
	schema: TKvSchema;
	ykvMap: YKvMap;
}) {
	return Object.fromEntries(
		Object.entries(schema).map(([keyName, columnSchema]) => [
			keyName,
			createKvHelper({
				ydoc,
				keyName,
				ykvMap,
				schema: columnSchema,
			}),
		]),
	) as {
		[K in keyof TKvSchema]: KvHelper<TKvSchema[K]>;
	};
}

export function createKvHelper<TFieldSchema extends KvFieldSchema>({
	ydoc,
	keyName,
	ykvMap,
	schema,
}: {
	ydoc: Y.Doc;
	keyName: string;
	ykvMap: YKvMap;
	schema: TFieldSchema;
}) {
	type TValue = KvValue<TFieldSchema>;
	type TSerializedValue = SerializedKvValue<TFieldSchema>;

	const nullable = isNullableFieldSchema(schema);

	const getOrCreateYjsValue = (): TValue => {
		const existing = ykvMap.get(keyName);
		if (existing !== undefined) {
			return existing as TValue;
		}

		if (schema['x-component'] === 'ytext') {
			const ytext = new Y.Text();
			ykvMap.set(keyName, ytext);
			return ytext as TValue;
		}

		if (schema['x-component'] === 'tags') {
			const yarray = new Y.Array<string>();
			ykvMap.set(keyName, yarray);
			return yarray as TValue;
		}

		return undefined as unknown as TValue;
	};

	const getDefaultValue = (): TValue | undefined => {
		if ('default' in schema && schema.default !== undefined) {
			return schema.default as TValue;
		}
		return undefined;
	};

	const getCurrentValue = (): TValue => {
		const value = ykvMap.get(keyName);

		if (value === undefined) {
			const defaultVal = getDefaultValue();
			if (defaultVal !== undefined) {
				return defaultVal;
			}
			if (nullable) {
				return null as TValue;
			}
		}

		if (schema['x-component'] === 'ytext' || schema['x-component'] === 'tags') {
			return getOrCreateYjsValue();
		}

		return value as TValue;
	};

	const setValueFromSerialized = (input: TSerializedValue): void => {
		ydoc.transact(() => {
			if (input === null) {
				ykvMap.set(keyName, null);
				return;
			}

			if (schema['x-component'] === 'ytext' && typeof input === 'string') {
				const ytext = getOrCreateYjsValue() as Y.Text;
				updateYTextFromString(ytext, input);
				return;
			}

			if (schema['x-component'] === 'tags' && Array.isArray(input)) {
				const yarray = getOrCreateYjsValue() as Y.Array<string>;
				updateYArrayFromArray(yarray, input);
				return;
			}

			if (schema['x-component'] === 'date' && isDateWithTimezoneString(input)) {
				ykvMap.set(keyName, input);
				return;
			}

			ykvMap.set(keyName, input as KvValue);
		});
	};

	return {
		/** The name of this KV key */
		name: keyName,

		/** The schema definition for this KV field */
		schema,

		/**
		 * Get the current value for this KV key.
		 *
		 * Returns the stored value, or the default value if not set,
		 * or null if nullable and no default exists.
		 *
		 * @returns The current value
		 *
		 * @example
		 * ```typescript
		 * const theme = kv.theme.get(); // 'dark' | 'light'
		 * ```
		 */
		get(): TValue {
			return getCurrentValue();
		},

		/**
		 * Set the value for this KV key.
		 *
		 * For Y.js-backed values (ytext, tags), provide plain JavaScript values
		 * which will be synced to the underlying Y.Text/Y.Array.
		 *
		 * @param value - The value to set
		 *
		 * @example
		 * ```typescript
		 * kv.theme.set('dark');
		 * kv.tags.set(['urgent', 'review']);
		 * ```
		 */
		set(value: TSerializedValue): void {
			setValueFromSerialized(value);
		},

		/**
		 * Watch for changes to this KV value.
		 *
		 * The callback fires whenever this specific key changes, whether from
		 * local updates or sync from other peers.
		 *
		 * @param callback - Function called with the new value on each change
		 * @returns Unsubscribe function to stop watching
		 *
		 * @example
		 * ```typescript
		 * const unsubscribe = kv.theme.observe((value) => {
		 *   document.body.className = value;
		 * });
		 *
		 * // Later: stop watching
		 * unsubscribe();
		 * ```
		 */
		observe(callback: (value: TValue) => void) {
			const handler = (event: Y.YMapEvent<KvValue>) => {
				if (event.keysChanged.has(keyName)) {
					callback(getCurrentValue());
				}
			};
			ykvMap.observe(handler);
			return () => ykvMap.unobserve(handler);
		},

		/**
		 * Reset this KV key to its default value.
		 *
		 * If a default is defined in the schema, sets to that value.
		 * If nullable with no default, sets to null.
		 * Otherwise, deletes the key entirely.
		 *
		 * @example
		 * ```typescript
		 * kv.theme.reset(); // Back to schema default
		 * ```
		 */
		reset(): void {
			ydoc.transact(() => {
				const defaultVal = getDefaultValue();
				if (defaultVal !== undefined) {
					setValueFromSerialized(
						serializeCellValue(defaultVal) as TSerializedValue,
					);
				} else if (nullable) {
					ykvMap.set(keyName, null);
				} else {
					ykvMap.delete(keyName);
				}
			});
		},

		/** Type inference helper for the runtime value type */
		$inferValue: null as unknown as TValue,

		/** Type inference helper for the serialized value type */
		$inferSerializedValue: null as unknown as TSerializedValue,
	};
}

export type KvHelper<TFieldSchema extends KvFieldSchema> = ReturnType<
	typeof createKvHelper<TFieldSchema>
>;
