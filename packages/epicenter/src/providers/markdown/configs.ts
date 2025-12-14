/**
 * @fileoverview Markdown Table Config Factory Functions
 *
 * This file provides convenience factory functions for creating `TableMarkdownConfig` objects,
 * which define how rows are serialized to markdown files and deserialized back.
 *
 * ## Contract
 *
 * All factory functions return a `TableMarkdownConfig<TTableSchema>` with all three functions:
 * - `serialize`: Converts a row to { frontmatter, body, filename }
 * - `parseFilename`: Parses a filename to extract { id, ...otherFields }
 * - `deserialize`: Converts { frontmatter, body, parsed } back to a row (with validation)
 *
 * These three functions MUST be provided together or not at all. This ensures consistency
 * between how files are written and how they're read back.
 *
 * ## Builder Pattern with Type Inference
 *
 * Use `defineTableConfig()` for proper generic inference with a fluent builder:
 *
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
 *     },
 *   });
 * ```
 *
 * ## Available Factories
 *
 * - `withBodyField(field)`: Common pattern where one field becomes the markdown body.
 * - `withTitleFilename(field)`: Human-readable filenames like `{title}-{id}.md`.
 *
 * The true default config (`DEFAULT_TABLE_CONFIG`) is defined in `markdown-provider.ts`.
 *
 * ## Usage
 *
 * ```typescript
 * import { markdownProvider, withBodyField, withTitleFilename } from '@epicenter/hq';
 *
 * markdownProvider(c, {
 *   tableConfigs: {
 *     // No config needed - uses defaults (all in frontmatter, {id}.md filename)
 *     settings: {},
 *
 *     // Use a convenience helper (content → body)
 *     articles: withBodyField('content'),
 *     posts: withBodyField('markdown'),
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
 * Custom serialization/deserialization behavior for a table.
 *
 * Defines how rows are converted to markdown files and vice versa.
 * When not provided, uses default behavior.
 *
 * ## Type Parameters
 *
 * - `TTableSchema`: The table's schema type
 * - `TFilename`: The filename format (can be template literal like `` `${string}-${string}.md` ``)
 * - `TParsed`: The structured data extracted from filename (must extend `{ id: string }`)
 *
 * ## Type Constraint
 *
 * The three functions (serialize, parseFilename, deserialize) must be
 * provided together or not at all. This ensures consistency:
 *
 * - `serialize` produces filenames matching `TFilename`
 * - `parseFilename` accepts `TFilename` and extracts `TParsed`
 * - `deserialize` receives `TParsed` from the parser
 *
 * Valid configurations:
 * - `{}` - Use all defaults
 * - `{ directory }` - Custom directory, default serialize/deserialize
 * - `{ serialize, parseFilename, deserialize }` - All custom (required pairing)
 *
 * Invalid configurations (compile error):
 * - `{ serialize }` - Missing parseFilename and deserialize
 * - `{ deserialize }` - Missing serialize and parseFilename
 * - `{ serialize, deserialize }` - Missing parseFilename
 */
export type TableMarkdownConfig<
	TTableSchema extends TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = {
	/**
	 * Directory for this table's markdown files.
	 *
	 * **Optional**: Defaults to the table name. Independent of serialize/deserialize.
	 *
	 * **Two ways to specify the path**:
	 *
	 * **Option 1: Relative paths** (recommended): Resolved relative to workspace directory
	 * ```typescript
	 * directory: './my-notes'      // → <workspace-dir>/my-notes
	 * directory: '../shared'       // → <workspace-dir>/../shared
	 * ```
	 *
	 * **Option 2: Absolute paths**: Used as-is, ignores workspace directory
	 * ```typescript
	 * directory: '/absolute/path/to/notes'
	 * ```
	 *
	 * @default table name (e.g., "posts" → workspace-dir/posts)
	 */
	directory?: string;
} & (
	| {
			/**
			 * Use all defaults for serialize/parseFilename/deserialize.
			 *
			 * Default behavior:
			 * - Serialize: All fields except id → frontmatter, empty body, filename "{id}.md"
			 * - ParseFilename: Strip .md extension, return { id }
			 * - Deserialize: Validate frontmatter against schema with id from parsed
			 */
			serialize?: undefined;
			parseFilename?: undefined;
			deserialize?: undefined;
	  }
	| {
			/**
			 * Serialize a row to markdown frontmatter, body, and filename.
			 *
			 * IMPORTANT: The filename MUST be a simple filename without path separators.
			 * The table's directory setting determines where the file is written.
			 *
			 * The returned filename type must match what `parseFilename` accepts.
			 *
			 * @param params.row - Row to serialize (already validated against schema)
			 * @param params.table - TableHelper with metadata (name, schema, validators)
			 * @returns Frontmatter object, markdown body string, and simple filename
			 */
			serialize: SerializeFn<TTableSchema>;

			/**
			 * Parse a filename to extract structured data including the row ID.
			 *
			 * This function defines the bidirectional contract:
			 * - Its input type (`TFilename`) constrains what `serialize` must return
			 * - Its output type (`TParsed`) is provided to `deserialize`
			 *
			 * @param filename - Simple filename (e.g., "My Post Title-abc123.md")
			 * @returns Parsed data with at least `id`, or undefined if parsing fails
			 *
			 * @example
			 * // For pattern: "{title}-{id}.md"
			 * parseFilename: (filename) => {
			 *   const basename = path.basename(filename, '.md');
			 *   const lastDash = basename.lastIndexOf('-');
			 *   if (lastDash === -1) return undefined;
			 *   return {
			 *     id: basename.substring(lastDash + 1),
			 *     titleFromFilename: basename.substring(0, lastDash),
			 *   };
			 * }
			 */
			parseFilename: ParseFilenameFn<TParsed>;

			/**
			 * Deserialize markdown frontmatter and body back to a full row.
			 *
			 * @param params.frontmatter - Parsed YAML frontmatter as a plain object
			 * @param params.body - Markdown body content (text after frontmatter delimiters)
			 * @param params.filename - Simple filename only (validated to not contain path separators)
			 * @param params.parsed - Structured data extracted by parseFilename (includes id)
			 * @param params.table - TableHelper with metadata (name, schema, validators)
			 * @returns Result with complete row (with id field), or error to skip this file
			 */
			deserialize: DeserializeFn<TTableSchema, TParsed>;
	  }
);

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
};

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
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     tabs: withTitleFilename('title'),
 *     notes: withTitleFilename('name', { maxTitleLength: 50 }),
 *   }
 * })
 * ```
 */
export function withTitleFilename<TTableSchema extends TableSchema>(
	titleField: keyof TTableSchema & string,
	options: { stripNulls?: boolean; maxTitleLength?: number } = {},
) {
	const { stripNulls = true, maxTitleLength = 80 } = options;

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
		});
}

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
		});
}
