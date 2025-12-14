/**
 * @fileoverview Markdown Table Config Factory Functions
 *
 * This file provides factory functions for creating `TableMarkdownConfig` objects,
 * which define how rows are serialized to markdown files and deserialized back.
 *
 * ## Contract
 *
 * All configs must provide three functions together:
 * - `serialize`: Converts a row to { frontmatter, body, filename }
 * - `parseFilename`: Parses a filename to extract { id, ...otherFields }
 * - `deserialize`: Converts { frontmatter, body, parsed } back to a row (with validation)
 *
 * Use factory functions to create configs - they handle this requirement automatically.
 *
 * ## Available Factories
 *
 * - `defaultTableConfig()`: Default behavior with optional directory override
 * - `withBodyField(field)`: One field becomes the markdown body
 * - `withTitleFilename(field)`: Human-readable `{title}-{id}.md` filenames
 * - `defineTableConfig().withParser().withSerializers()`: Full custom builder
 *
 * ## Usage
 *
 * ```typescript
 * import { markdownProvider, defaultTableConfig, withBodyField, withTitleFilename } from '@epicenter/hq';
 *
 * markdownProvider(c, {
 *   tableConfigs: {
 *     // Default: all in frontmatter, {id}.md filename
 *     settings: defaultTableConfig(),
 *
 *     // Custom directory with default behavior
 *     config: defaultTableConfig({ directory: './app-config' }),
 *
 *     // Field becomes markdown body
 *     articles: withBodyField('content'),
 *     posts: withBodyField('markdown', { directory: './blog' }),
 *
 *     // Human-readable filenames
 *     tabs: withTitleFilename('title'),
 *   }
 * })
 * ```
 */

import path from 'node:path';
import { type } from 'arktype';
import filenamify from 'filenamify';
import { Ok, type Result } from 'wellcrafted/result';
import type { TableHelper } from '../../core/db/table-helper';
import type { SerializedRow, TableSchema } from '../../core/schema';
import {
	MarkdownProviderErr,
	type MarkdownProviderError,
} from './markdown-provider';

// ─────────────────────────────────────────────────────────────────────────────
// Helper types for TableMarkdownConfig
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serialize function signature
 */
type SerializeFn<TTableSchema extends TableSchema> = (params: {
	row: SerializedRow<TTableSchema>;
	table: TableHelper<TTableSchema>;
}) => {
	frontmatter: Record<string, unknown>;
	body: string;
	filename: string;
};

/**
 * Base parsed result that all parseFilename functions must return.
 * Must contain at least `id`, but can include additional fields.
 */
export type ParsedFilename = { id: string };

/**
 * Parse filename function signature.
 * Extracts structured data from a filename. The returned object must contain `id`,
 * and may include additional fields that will be passed to deserialize.
 */
type ParseFilenameFn<TParsed extends ParsedFilename> = (
	filename: string,
) => TParsed | undefined;

/**
 * Deserialize function signature.
 * The `parsed` parameter contains whatever parseFilename returned.
 */
type DeserializeFn<
	TTableSchema extends TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = (params: {
	frontmatter: Record<string, unknown>;
	body: string;
	filename: string;
	parsed: TParsed;
	table: TableHelper<TTableSchema>;
}) => Result<SerializedRow<TTableSchema>, MarkdownProviderError>;

// ─────────────────────────────────────────────────────────────────────────────
// Builder Pattern for TableMarkdownConfig
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A table config with all functions guaranteed to be defined.
 * This is what the builder pattern returns, and what's used internally after
 * merging user configs with DEFAULT_TABLE_CONFIG.
 */
export type ResolvedTableMarkdownConfig<
	TTableSchema extends TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = {
	directory?: string;
	serialize: SerializeFn<TTableSchema>;
	parseFilename: ParseFilenameFn<TParsed>;
	deserialize: DeserializeFn<TTableSchema, TParsed>;
};

/**
 * Step 2: After parser is defined, add serializers.
 * - `TFilename` from parser input constrains serialize's filename return
 * - `TParsed` from parser output flows to deserialize's parsed parameter
 */
type ConfigBuilderWithParser<
	TTableSchema extends TableSchema,
	TFilename extends string,
	TParsed extends ParsedFilename,
> = {
	withSerializers(config: {
		serialize: (params: {
			row: SerializedRow<TTableSchema>;
			table: TableHelper<TTableSchema>;
		}) => {
			frontmatter: Record<string, unknown>;
			body: string;
			filename: TFilename;
		};
		deserialize: (params: {
			frontmatter: Record<string, unknown>;
			body: string;
			filename: TFilename;
			parsed: TParsed;
			table: TableHelper<TTableSchema>;
		}) => Result<SerializedRow<TTableSchema>, MarkdownProviderError>;
		directory?: string;
	}): ResolvedTableMarkdownConfig<TTableSchema, TParsed>;
};

/**
 * Creates a TableMarkdownConfig using a builder pattern with full type inference.
 *
 * The builder ensures bidirectional type flow:
 * - `TFilename`: Inferred from parser's input parameter, enforced on serialize's return
 * - `TParsed`: Inferred from parser's return type, provided to deserialize's parsed param
 *
 * @example
 * ```typescript
 * const config = defineTableConfig<MySchema>()
 *   .withParser((filename) => {
 *     const basename = path.basename(filename, '.md');
 *     const lastDash = basename.lastIndexOf('-');
 *     return {
 *       id: basename.substring(lastDash + 1),
 *       titleFromFilename: basename.substring(0, lastDash),
 *     };
 *   })
 *   .withSerializers({
 *     serialize: ({ row }) => ({
 *       frontmatter: { ...row },
 *       body: '',
 *       filename: `${row.title}-${row.id}.md`,
 *     }),
 *     deserialize: ({ parsed, frontmatter, table }) => {
 *       // parsed.id and parsed.titleFromFilename are fully typed!
 *       const { id, titleFromFilename } = parsed;
 *       // ...
 *     },
 *   });
 *
 * // With explicit template literal for stricter filename validation:
 * type TitleIdFilename = `${string}-${string}.md`;
 *
 * const strictConfig = defineTableConfig<MySchema>()
 *   .withParser((filename: TitleIdFilename) => ({
 *     id: extractId(filename),
 *     title: extractTitle(filename),
 *   }))
 *   .withSerializers({
 *     serialize: ({ row }) => ({
 *       frontmatter: {},
 *       body: '',
 *       filename: `${row.title}-${row.id}.md` as TitleIdFilename,
 *     }),
 *     deserialize: ({ parsed }) => { ... },
 *   });
 * ```
 */
export function defineTableConfig<TTableSchema extends TableSchema>(): {
	withParser<TFilename extends string, TParsed extends ParsedFilename>(
		parseFilename: (filename: TFilename) => TParsed | undefined,
	): ConfigBuilderWithParser<TTableSchema, TFilename, TParsed>;
} {
	return {
		withParser<TFilename extends string, TParsed extends ParsedFilename>(
			parseFilename: (filename: TFilename) => TParsed | undefined,
		): ConfigBuilderWithParser<TTableSchema, TFilename, TParsed> {
			return {
				withSerializers(config) {
					return {
						directory: config.directory,
						serialize: config.serialize as SerializeFn<TTableSchema>,
						parseFilename: parseFilename as ParseFilenameFn<TParsed>,
						deserialize: config.deserialize as DeserializeFn<
							TTableSchema,
							TParsed
						>,
					};
				},
			};
		},
	};
}

/**
 * Configuration for how a table's rows are serialized to markdown files.
 *
 * This is an alias for `ResolvedTableMarkdownConfig`. All configs must provide
 * the complete set of serialize/parseFilename/deserialize functions.
 *
 * Use one of the factory functions to create configs:
 * - `defaultTableConfig()` - Default behavior with optional directory
 * - `withBodyField(field)` - Field becomes markdown body
 * - `withTitleFilename(field)` - Human-readable `{title}-{id}.md` filenames
 * - `defineTableConfig().withParser(...).withSerializers(...)` - Full custom
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     settings: defaultTableConfig(),
 *     posts: withTitleFilename('title'),
 *     articles: withBodyField('content'),
 *   }
 * })
 * ```
 */
export type TableMarkdownConfig<
	TTableSchema extends TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = ResolvedTableMarkdownConfig<TTableSchema, TParsed>;

/**
 * Default table configuration using the `{id}.md` filename pattern.
 *
 * Default behavior:
 * - Serialize: All fields except id → frontmatter, empty body, filename "{id}.md"
 * - ParseFilename: Strip .md extension, return { id }
 * - Deserialize: Validate frontmatter against schema with id from parsed
 *
 * Use this when your table doesn't have a dedicated content/body field.
 */
export const DEFAULT_TABLE_CONFIG = defineTableConfig<TableSchema>()
	.withParser((filename: `${string}.md`) => {
		const id = path.basename(filename, '.md');
		return { id };
	})
	.withSerializers({
		serialize: ({ row: { id, ...rest } }) => ({
			frontmatter: rest,
			body: '',
			filename: `${id}.md`,
		}),
		deserialize: ({ frontmatter, parsed, table }) => {
			const { id } = parsed;

			// Combine id with frontmatter
			const data = { id, ...frontmatter };

			// Validate using direct arktype pattern
			const validator = table.validators.toArktype();
			const result = validator(data);

			if (result instanceof type.errors) {
				return MarkdownProviderErr({
					message: `Failed to validate row ${id}`,
					context: { fileName: `${id}.md`, id, reason: result.summary },
				});
			}

			return Ok(result as SerializedRow<TableSchema>);
		},
	});

/**
 * Creates a default table config with optional directory override.
 *
 * Use this when you want default serialization behavior but need a custom directory.
 *
 * @param options.directory - Custom directory for this table's markdown files
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     settings: defaultTableConfig(),  // Uses table name as directory
 *     config: defaultTableConfig({ directory: './app-config' }),
 *   }
 * })
 * ```
 */
export function defaultTableConfig<TTableSchema extends TableSchema = TableSchema>(
	options?: { directory?: string },
): ResolvedTableMarkdownConfig<TTableSchema> {
	return {
		...DEFAULT_TABLE_CONFIG,
		directory: options?.directory,
	} as ResolvedTableMarkdownConfig<TTableSchema>;
}

/**
 * Factory function to create a table config with human-readable filenames.
 *
 * Creates filenames in the format: `{title}-{id}.md`
 *
 * This pattern provides:
 * - Readability: Title comes first for easy scanning in file browsers
 * - Uniqueness: ID suffix guarantees no filename collisions
 * - Sorting: Files sort alphabetically by title
 *
 * @param titleField - The field to use for the readable part of the filename
 * @param options.stripNulls - Remove null values from frontmatter (default: true)
 * @param options.maxTitleLength - Max chars for title portion (default: 80)
 * @param options.directory - Custom directory for this table's markdown files
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     tabs: withTitleFilename('title'),
 *     notes: withTitleFilename('name', { maxTitleLength: 50 }),
 *     posts: withTitleFilename('title', { directory: './blog-posts' }),
 *   }
 * })
 * ```
 */
export function withTitleFilename<TTableSchema extends TableSchema>(
	titleField: keyof TTableSchema & string,
	options: { stripNulls?: boolean; maxTitleLength?: number; directory?: string } = {},
) {
	const { stripNulls = true, maxTitleLength = 80, directory } = options;

	return defineTableConfig<TTableSchema>()
		.withParser((filename: `${string}-${string}.md`) => {
			const basename = path.basename(filename, '.md');
			const lastDashIndex = basename.lastIndexOf('-');
			// If no dash found, treat entire basename as ID (fallback to default behavior)
			const id =
				lastDashIndex === -1 ? basename : basename.substring(lastDashIndex + 1);
			const titleFromFilename =
				lastDashIndex === -1 ? '' : basename.substring(0, lastDashIndex);
			return { id, titleFromFilename };
		})
		.withSerializers({
			serialize: ({ row }) => {
				const { id, ...rest } = row;
				const rawTitle = (row[titleField] as string) || '';

				// Use filenamify for robust cross-platform filename sanitization
				// Handles Unicode normalization, grapheme-aware truncation, emoji preservation
				const sanitizedTitle =
					rawTitle.trim() === ''
						? 'Untitled'
						: filenamify(rawTitle, {
								maxLength: maxTitleLength,
								replacement: '',
							});

				// Optionally strip null values for cleaner YAML
				const frontmatter = stripNulls
					? Object.fromEntries(
							Object.entries(rest).filter(([_, value]) => value !== null),
						)
					: rest;

				return {
					frontmatter,
					body: '',
					filename: `${sanitizedTitle}-${id}.md`,
				};
			},

			deserialize: ({ frontmatter, parsed, table }) => {
				const { id } = parsed;

				// Combine id with frontmatter
				const data = { id, ...frontmatter };

				// Validate using direct arktype pattern
				const validator = table.validators.toArktype();
				const result = validator(data);

				if (result instanceof type.errors) {
					return MarkdownProviderErr({
						message: `Failed to validate row ${id}`,
						context: {
							fileName: `${id}.md`,
							id,
							reason: result.summary,
						},
					});
				}

				return Ok(result as SerializedRow<TTableSchema>);
			},

			directory,
		});
}

/**
 * Options for the withBodyField factory function
 */
export type WithBodyFieldOptions<
	TTableSchema extends TableSchema = TableSchema,
> = {
	/**
	 * Strip null values from frontmatter for cleaner YAML output.
	 * Nullable fields are restored via arktype's .default(null) during deserialization.
	 * @default true
	 */
	stripNulls?: boolean;

	/**
	 * Field to use for the filename (without .md extension).
	 * @default 'id'
	 */
	filenameField?: keyof TTableSchema & string;

	/**
	 * Custom directory for this table's markdown files.
	 * Resolved relative to workspace directory.
	 */
	directory?: string;
};

/**
 * Factory function to create a table config where a specific field becomes the markdown body.
 *
 * This is a common pattern for tables with a main content field (like `content`, `body`, or `markdown`)
 * that should be stored as the markdown body rather than in frontmatter.
 *
 * @param bodyField - The field name that should become the markdown body
 * @param options - Optional configuration for null stripping and filename field
 * @returns A TableMarkdownConfig with serialize/deserialize functions
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     articles: withBodyField('content'),
 *     posts: withBodyField('markdown'),
 *     journal: withBodyField('content', { stripNulls: false }),
 *   }
 * })
 * ```
 */
export function withBodyField<TTableSchema extends TableSchema>(
	bodyField: keyof TTableSchema & string,
	options: WithBodyFieldOptions<TTableSchema> = {},
) {
	const {
		stripNulls = true,
		filenameField = 'id' as keyof TTableSchema & string,
		directory,
	} = options;

	return defineTableConfig<TTableSchema>()
		.withParser((filename: `${string}.md`) => {
			const id = path.basename(filename, '.md');
			return { id };
		})
		.withSerializers({
			serialize: ({ row }) => {
				// Extract body field, filename field, and the rest
				const { [bodyField]: body, [filenameField]: filename, ...rest } = row;

				// Optionally strip null values for cleaner YAML
				const frontmatter = stripNulls
					? Object.fromEntries(
							Object.entries(rest).filter(([_, value]) => value !== null),
						)
					: rest;

				return {
					frontmatter,
					body: (body as string) ?? '',
					filename: `${filename}.md`,
				};
			},

			deserialize: ({ frontmatter, body, parsed, table }) => {
				const { id: rowId } = parsed;

				// Create validator that omits the body field and filename field
				// Nullable fields that were stripped during serialize are restored via .default(null)
				const FrontMatter = table.validators
					.toArktype()
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					.omit(filenameField as any, bodyField as any);

				const validatedFrontmatter = FrontMatter(frontmatter);

				if (validatedFrontmatter instanceof type.errors) {
					return MarkdownProviderErr({
						message: `Invalid frontmatter for row ${rowId}`,
						context: {
							fileName: `${rowId}.md`,
							id: rowId,
							reason: validatedFrontmatter.summary,
						},
					});
				}

				// Reconstruct the full row
				const row = {
					[filenameField]: rowId,
					[bodyField]: body,
					...(validatedFrontmatter as Record<string, unknown>),
				} as SerializedRow<TTableSchema>;

				return Ok(row);
			},

			directory,
		});
}
