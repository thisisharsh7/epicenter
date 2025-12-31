import { type } from 'arktype';
import * as Y from 'yjs';

import { defineMutation, defineQuery } from '../actions';
import type {
	KvColumnSchema,
	KvSchema,
	KvValue,
	SerializedKvValue,
} from '../schema';
import { isDateWithTimezoneString, serializeCellValue } from '../schema';
import { updateYArrayFromArray, updateYTextFromString } from '../utils/yjs';

export type YKvMap = Y.Map<KvValue>;

/**
 * Creates a collection of typed KV helpers for all keys in a schema.
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

function createKvHelper<TColumnSchema extends KvColumnSchema>({
	ydoc,
	keyName,
	ykvMap,
	schema,
}: {
	ydoc: Y.Doc;
	keyName: string;
	ykvMap: YKvMap;
	schema: TColumnSchema;
}): KvHelper<TColumnSchema> {
	type TValue = KvValue<TColumnSchema>;
	type TSerializedValue = SerializedKvValue<TColumnSchema>;

	const getOrCreateYjsValue = (): TValue => {
		const existing = ykvMap.get(keyName);
		if (existing !== undefined) {
			return existing as TValue;
		}

		if (schema.type === 'ytext') {
			const ytext = new Y.Text();
			ykvMap.set(keyName, ytext);
			return ytext as TValue;
		}

		if (schema.type === 'multi-select') {
			const yarray = new Y.Array<string>();
			ykvMap.set(keyName, yarray);
			return yarray as TValue;
		}

		return undefined as unknown as TValue;
	};

	const getDefaultValue = (): TValue | undefined => {
		if ('default' in schema && schema.default !== undefined) {
			const def = schema.default;
			return (typeof def === 'function' ? def() : def) as TValue;
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
			if (schema.nullable) {
				return null as TValue;
			}
		}

		if (schema.type === 'ytext' || schema.type === 'multi-select') {
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

			if (schema.type === 'ytext' && typeof input === 'string') {
				const ytext = getOrCreateYjsValue() as Y.Text;
				updateYTextFromString(ytext, input);
				return;
			}

			if (schema.type === 'multi-select' && Array.isArray(input)) {
				const yarray = getOrCreateYjsValue() as Y.Array<string>;
				updateYArrayFromArray(yarray, input);
				return;
			}

			if (schema.type === 'date' && isDateWithTimezoneString(input)) {
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

		observe(callback) {
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
					} else if (schema.nullable) {
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
	switch (schema.type) {
		case 'text':
			return schema.nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'ytext':
			return schema.nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'integer':
			return schema.nullable
				? type({ value: 'number | null' })
				: type({ value: 'number' });
		case 'real':
			return schema.nullable
				? type({ value: 'number | null' })
				: type({ value: 'number' });
		case 'boolean':
			return schema.nullable
				? type({ value: 'boolean | null' })
				: type({ value: 'boolean' });
		case 'date':
			return schema.nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'select':
			return schema.nullable
				? type({ value: 'string | null' })
				: type({ value: 'string' });
		case 'multi-select':
			return schema.nullable
				? type({ value: 'string[] | null' })
				: type({ value: 'string[]' });
		case 'json':
			return type({ value: 'unknown' });
		default:
			return type({ value: 'unknown' });
	}
}

export type KvHelper<TColumnSchema extends KvColumnSchema> = {
	name: string;
	schema: TColumnSchema;
	get: ReturnType<typeof defineQuery<undefined, KvValue<TColumnSchema>>>;
	set: ReturnType<
		typeof defineMutation<ReturnType<typeof type<{ value: unknown }>>, void>
	>;
	observe: (callback: (value: KvValue<TColumnSchema>) => void) => () => void;
	reset: ReturnType<typeof defineMutation<undefined, void>>;
	$inferValue: KvValue<TColumnSchema>;
	$inferSerializedValue: SerializedKvValue<TColumnSchema>;
};
