import type {
	ColumnBuilderBase,
	ColumnBuilderBaseConfig,
	ColumnDataType,
	HasDefault,
	NotNull,
} from 'drizzle-orm';
import {
	customType,
	integer as drizzleInteger,
	real as drizzleReal,
	text as drizzleText,
} from 'drizzle-orm/sqlite-core';
import type { DateWithTimezoneString } from '../../../core/schema';
import { generateId } from '../../../core/schema';
import {
	fromDateTimeString,
	type Temporal,
	toDateTimeString,
} from '../../../core/schema/runtime/datetime';
import type {
	StandardSchemaV1,
	StandardSchemaWithJSONSchema,
} from '../../../core/schema/standard/types';

/**
 * Type helper that composes Drizzle column modifiers based on options.
 * Static defaults only - no runtime/lazy defaults.
 */
type ApplyColumnModifiers<
	TBase extends ColumnBuilderBase<
		ColumnBuilderBaseConfig<ColumnDataType, string>,
		object
	>,
	TNullable extends boolean,
	TDefault,
> = TDefault extends undefined
	? TNullable extends false
		? NotNull<TBase>
		: TBase
	: TNullable extends false
		? HasDefault<NotNull<TBase>>
		: HasDefault<TBase>;

/**
 * Creates an ID column - always primary key with nano ID generation
 * This is the only column type that can be a primary key.
 * @example
 * id() // Primary key ID column with nano ID generation
 */
export function id() {
	return (
		drizzleText()
			.notNull()
			.primaryKey()
			// .$type<Id>()
			.$defaultFn(() => generateId())
	);
}

export function text<
	TNullable extends boolean = false,
	TDefault extends string | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleText();
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined) column = column.default(defaultValue);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

export function integer<
	TNullable extends boolean = false,
	TDefault extends number | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleInteger();
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined) column = column.default(defaultValue);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

export function real<
	TNullable extends boolean = false,
	TDefault extends number | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleReal();
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined) column = column.default(defaultValue);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

export function boolean<
	TNullable extends boolean = false,
	TDefault extends boolean | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	let column = drizzleInteger({ mode: 'boolean' });
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined) column = column.default(defaultValue);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

/**
 * Creates a date column with timezone support using Temporal API.
 *
 * Stored as TEXT in format "ISO_UTC|TIMEZONE" (e.g., "2024-01-01T20:00:00.000Z|America/New_York").
 * Parsed to Temporal.ZonedDateTime on read.
 */
export function date<
	TNullable extends boolean = false,
	TDefault extends Temporal.ZonedDateTime | undefined = undefined,
>({
	nullable = false as TNullable,
	default: defaultValue,
}: {
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	const dateTimeType = customType<{
		data: Temporal.ZonedDateTime;
		driverParam: DateWithTimezoneString;
	}>({
		dataType: () => 'text',
		toDriver: (value): DateWithTimezoneString => toDateTimeString(value),
		fromDriver: (value): Temporal.ZonedDateTime =>
			fromDateTimeString(value as DateWithTimezoneString),
	});

	let column = dateTimeType();

	if (!nullable) column = column.notNull();

	if (defaultValue !== undefined) {
		column = column.default(defaultValue);
	}

	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

type TagsArray<TOptions extends readonly string[] | undefined> =
	TOptions extends readonly string[] ? TOptions[number][] : string[];

export function tags<
	const TOptions extends readonly string[] | undefined = undefined,
	TNullable extends boolean = false,
	TDefault extends TagsArray<TOptions> | undefined = undefined,
>({
	options,
	nullable = false as TNullable,
	default: defaultValue,
}: {
	options?: TOptions;
	nullable?: TNullable;
	default?: TDefault;
} = {}) {
	const optionsSet = options ? new Set(options) : null;

	const tagsType = customType<{
		data: TagsArray<TOptions>;
		driverData: string;
	}>({
		dataType: () => 'text',
		toDriver: (value: TagsArray<TOptions>): string => JSON.stringify(value),
		fromDriver: (value: string): TagsArray<TOptions> => {
			const parsed = JSON.parse(value);
			if (!Array.isArray(parsed)) {
				throw new Error(`Expected array, got ${typeof parsed}`);
			}
			const nonStringItems = parsed.filter((item) => typeof item !== 'string');
			if (nonStringItems.length > 0) {
				throw new Error(
					`Tags must be strings, found: ${nonStringItems.map((item) => typeof item).join(', ')}`,
				);
			}
			const stringValues = parsed as string[];
			if (optionsSet) {
				const invalidValues = stringValues.filter(
					(item) => !optionsSet.has(item),
				);
				if (invalidValues.length > 0) {
					throw new Error(
						`Invalid tag values: ${invalidValues.join(', ')}. Allowed: ${options?.join(', ')}`,
					);
				}
			}
			return stringValues as TagsArray<TOptions>;
		},
	});

	let column = tagsType();
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined) column = column.default(defaultValue as any);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}

export function json<
	const TSchema extends StandardSchemaWithJSONSchema,
	TNullable extends boolean = false,
	TDefault extends
		| StandardSchemaV1.InferOutput<TSchema>
		| undefined = undefined,
>({
	schema,
	nullable = false as TNullable,
	default: defaultValue,
}: {
	schema: TSchema;
	nullable?: TNullable;
	default?: TDefault;
}) {
	type TOutput = StandardSchemaV1.InferOutput<TSchema>;

	const jsonType = customType<{
		data: TOutput;
		driverData: string;
	}>({
		dataType: () => 'text',
		toDriver: (value: TOutput): string => JSON.stringify(value),
		fromDriver: (value: string): TOutput => {
			const parsed = JSON.parse(value);
			const result = schema['~standard'].validate(parsed);
			if (result instanceof Promise) {
				throw new Error('Async validation not supported for JSON columns');
			}
			if (result.issues) {
				const messages = result.issues.map((i) => i.message).join(', ');
				throw new Error(`JSON validation failed: ${messages}`);
			}
			return result.value as TOutput;
		},
	});

	let column = jsonType();
	if (!nullable) column = column.notNull();
	if (defaultValue !== undefined)
		column = column.default(defaultValue as TOutput);
	return column as ApplyColumnModifiers<typeof column, TNullable, TDefault>;
}
