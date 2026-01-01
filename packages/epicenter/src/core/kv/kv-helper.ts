import { type } from 'arktype';
import * as Y from 'yjs';

import { defineMutation, defineQuery } from '../actions';
import type {
	KvColumnSchema,
	KvSchema,
	KvValue,
	SerializedKvValue,
} from '../schema';
import {
	isDateWithTimezoneString,
	isNullableColumnSchema,
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

export function createKvHelper<TColumnSchema extends KvColumnSchema>({
	ydoc,
	keyName,
	ykvMap,
	schema,
}: {
	ydoc: Y.Doc;
	keyName: string;
	ykvMap: YKvMap;
	schema: TColumnSchema;
}) {
	type TValue = KvValue<TColumnSchema>;
	type TSerializedValue = SerializedKvValue<TColumnSchema>;

	const nullable = isNullableColumnSchema(schema);

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

	const inputSchema = createInputSchema(schema);

	return {
		name: keyName,
		schema,

		get: defineQuery({
			description: `Get ${keyName} value`,
			handler: () => getCurrentValue(),
		}),

		set: defineMutation({
			input: inputSchema,
			description: `Set ${keyName} value`,
			handler: (input) => {
				setValueFromSerialized(input.value as TSerializedValue);
			},
		}),

		observe(callback: (value: TValue) => void) {
			const handler = (event: Y.YMapEvent<KvValue>) => {
				if (event.keysChanged.has(keyName)) {
					callback(getCurrentValue());
				}
			};
			ykvMap.observe(handler);
			return () => ykvMap.unobserve(handler);
		},

		reset: defineMutation({
			description: `Reset ${keyName} to default`,
			handler: () => {
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
		}),

		$inferValue: null as unknown as TValue,
		$inferSerializedValue: null as unknown as TSerializedValue,
	};
}

function createInputSchema(schema: KvColumnSchema) {
	const nullable = isNullableColumnSchema(schema);

	switch (schema['x-component']) {
		case 'text':
			return nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'ytext':
			return nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'integer':
			return nullable
				? type({ value: 'number | null' })
				: type({ value: 'number' });
		case 'real':
			return nullable
				? type({ value: 'number | null' })
				: type({ value: 'number' });
		case 'boolean':
			return nullable
				? type({ value: 'boolean | null' })
				: type({ value: 'boolean' });
		case 'date':
			return nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'select':
			return nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'tags':
			return nullable
				? type({ value: 'string[] | null' })
				: type({ value: 'string[]' });
		case 'json':
			return type({ value: 'unknown' });
		default:
			return type({ value: 'unknown' });
	}
}

export type KvHelper<TColumnSchema extends KvColumnSchema> = ReturnType<
	typeof createKvHelper<TColumnSchema>
>;
