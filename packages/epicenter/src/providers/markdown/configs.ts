/**
 * @fileoverview Markdown Table Config Factory Functions
 *
 * This file provides types and factory functions for configuring how tables
 * sync to markdown files.
 *
 * ## API Overview
 *
 * Each table config has two concerns:
 * - `directory?`: WHERE files go (defaults to table name)
 * - `serializer?`: HOW rows are encoded/decoded (defaults to all-frontmatter)
 *
 * ## Available Serializer Factories
 *
 * - `defaultSerializer()`: All fields in frontmatter, `{id}.md` filename
 * - `bodyFieldSerializer(field)`: One field becomes the markdown body
 * - `titleFilenameSerializer(field)`: Human-readable `{title}-{id}.md` filenames
 *
 * ## Usage
 *
 * ```typescript
 * import { markdownProvider, bodyFieldSerializer, titleFilenameSerializer } from '@epicenter/hq';
 *
 * markdownProvider(c, {
 *   tableConfigs: {
 *     // Both defaults (empty object)
 *     settings: {},
 *
 *     // Custom directory only
 *     config: { directory: './app-config' },
 *
 *     // Custom serializer only
 *     posts: { serializer: bodyFieldSerializer('content') },
 *
 *     // Both custom
 *     drafts: {
 *       directory: './drafts',
 *       serializer: bodyFieldSerializer('content'),
 *     },
 *
 *     // Title-based filenames
 *     tabs: { serializer: titleFilenameSerializer('title') },
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
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base parsed result that all parseFilename functions must return.
 * Must contain at least `id`, but can include additional fields.
 */
export type ParsedFilename = { id: string };

/**
 * A serializer defines how to encode rows to markdown files and decode them back.
 *
 * @typeParam TTableSchema - The table schema being serialized
 * @typeParam TParsed - Additional data extracted from filename beyond `id`
 */
export type MarkdownSerializer<
	TTableSchema extends TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = {
	/**
	 * Encode: Convert a row to markdown file format.
	 * Returns frontmatter object, body string, and filename.
	 */
	serialize: (params: {
		row: SerializedRow<TTableSchema>;
		table: TableHelper<TTableSchema>;
	}) => {
		frontmatter: Record<string, unknown>;
		body: string;
		filename: string;
	};

	/**
	 * Decode: Convert markdown file back to a row.
	 * Two-step process: parse filename first, then parse content.
	 */
	deserialize: {
		/**
		 * Step 1: Extract structured data from filename.
		 * Must return at least { id }, can include additional fields.
		 * Return undefined if filename doesn't match expected pattern.
		 */
		parseFilename: (filename: string) => TParsed | undefined;

		/**
		 * Step 2: Reconstruct the row from frontmatter, body, and parsed filename data.
		 * Called only if parseFilename succeeded.
		 */
		fromContent: (params: {
			frontmatter: Record<string, unknown>;
			body: string;
			filename: string;
			parsed: TParsed;
			table: TableHelper<TTableSchema>;
		}) => Result<SerializedRow<TTableSchema>, MarkdownProviderError>;
	};
};

/**
 * Configuration for how a table syncs to markdown files.
 * Both fields are optional with sensible defaults.
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     settings: {},  // All defaults
 *     posts: { serializer: bodyFieldSerializer('content') },
 *     drafts: { directory: './drafts', serializer: bodyFieldSerializer('content') },
 *   }
 * })
 * ```
 */
export type TableMarkdownConfig<
	TTableSchema extends TableSchema = TableSchema,
	TParsed extends ParsedFilename = ParsedFilename,
> = {
	/**
	 * WHERE files go. Resolved relative to workspace directory.
	 * @default table.name (e.g., "posts" table -> "./posts/")
	 */
	directory?: string;

	/**
	 * HOW files are encoded/decoded.
	 * @default Default serializer (all fields to frontmatter, {id}.md filename)
	 */
	serializer?: MarkdownSerializer<TTableSchema, TParsed>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Builder Pattern for Type-Safe Serializers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Step 2: After parser is defined, add serialize/fromContent functions.
 *
 * Type flow:
 * - `TFilename` from parser input constrains serialize's filename return
 * - `TParsed` from parser output flows to fromContent's parsed parameter
 */
type SerializerBuilderWithParser<
	TTableSchema extends TableSchema,
	TFilename extends string,
	TParsed extends ParsedFilename,
> = {
	withCodecs(config: {
		serialize: (params: {
			row: SerializedRow<TTableSchema>;
			table: TableHelper<TTableSchema>;
		}) => {
			frontmatter: Record<string, unknown>;
			body: string;
			filename: TFilename;
		};
		fromContent: (params: {
			frontmatter: Record<string, unknown>;
			body: string;
			filename: TFilename;
			parsed: TParsed;
			table: TableHelper<TTableSchema>;
		}) => Result<SerializedRow<TTableSchema>, MarkdownProviderError>;
	}): MarkdownSerializer<TTableSchema, TParsed>;
};

/**
 * Creates a MarkdownSerializer using a builder pattern with full type inference.
 *
 * The builder ensures bidirectional type flow:
 * - `TFilename`: Inferred from parser's input parameter, enforced on serialize's return
 * - `TParsed`: Inferred from parser's return type, provided to fromContent's parsed param
 *
 * This provides excellent type safety: the filename format you parse must match
 * the filename format you serialize to, and any extra data you extract from
 * the filename is automatically available in fromContent with the correct type.
 *
 * @example
 * ```typescript
 * // Basic usage with template literal types
 * const serializer = defineSerializer<MySchema>()
 *   .withParser((filename: `${string}.md`) => {
 *     const id = path.basename(filename, '.md');
 *     return { id };
 *   })
 *   .withCodecs({
 *     serialize: ({ row }) => ({
 *       frontmatter: { ...row },
 *       body: '',
 *       filename: `${row.id}.md`,  // Must match parser's TFilename
 *     }),
 *     fromContent: ({ parsed, frontmatter }) => {
 *       // parsed.id is fully typed from parser's return!
 *       return Ok({ id: parsed.id, ...frontmatter });
 *     },
 *   });
 *
 * // Advanced: Extract extra data from filename
 * type TitleIdFilename = `${string}-${string}.md`;
 *
 * const titleSerializer = defineSerializer<TabSchema>()
 *   .withParser((filename: TitleIdFilename) => {
 *     const basename = path.basename(filename, '.md');
 *     const lastDash = basename.lastIndexOf('-');
 *     return {
 *       id: basename.substring(lastDash + 1),
 *       titleFromFilename: basename.substring(0, lastDash),
 *     };
 *   })
 *   .withCodecs({
 *     serialize: ({ row }) => ({
 *       frontmatter: {},
 *       body: '',
 *       filename: `${row.title}-${row.id}.md` as TitleIdFilename,
 *     }),
 *     fromContent: ({ parsed }) => {
 *       // parsed.titleFromFilename is typed!
 *       console.log(parsed.titleFromFilename);
 *       return Ok({ id: parsed.id, ... });
 *     },
 *   });
 * ```
 */
export function defineSerializer<TTableSchema extends TableSchema>(): {
	withParser<TFilename extends string, TParsed extends ParsedFilename>(
		parseFilename: (filename: TFilename) => TParsed | undefined,
	): SerializerBuilderWithParser<TTableSchema, TFilename, TParsed>;
} {
	return {
		withParser<TFilename extends string, TParsed extends ParsedFilename>(
			parseFilename: (filename: TFilename) => TParsed | undefined,
		): SerializerBuilderWithParser<TTableSchema, TFilename, TParsed> {
			return {
				withCodecs(config) {
					return {
						serialize: config.serialize as MarkdownSerializer<TTableSchema, TParsed>['serialize'],
						deserialize: {
							parseFilename: parseFilename as MarkdownSerializer<TTableSchema, TParsed>['deserialize']['parseFilename'],
							fromContent: config.fromContent as MarkdownSerializer<TTableSchema, TParsed>['deserialize']['fromContent'],
						},
					};
				},
			};
		},
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Serializer Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default serializer: all fields to frontmatter, `{id}.md` filename.
 *
 * Serialization behavior:
 * - Serialize: All fields except id go to frontmatter, empty body, filename "{id}.md"
 * - ParseFilename: Strip .md extension, return { id }
 * - Deserialize: Validate frontmatter against schema with id from parsed
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     settings: {},  // Uses defaultSerializer() implicitly
 *     config: { serializer: defaultSerializer() },  // Explicit
 *   }
 * })
 * ```
 */
export function defaultSerializer<
	TTableSchema extends TableSchema = TableSchema,
>(): MarkdownSerializer<TTableSchema> {
	return defineSerializer<TTableSchema>()
		.withParser((filename: `${string}.md`) => {
			const id = path.basename(filename, '.md');
			return { id };
		})
		.withCodecs({
			serialize: ({ row: { id, ...rest } }) => ({
				frontmatter: rest,
				body: '',
				filename: `${id}.md`,
			}),

			fromContent: ({ frontmatter, parsed, table }) => {
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

				return Ok(result as SerializedRow<TTableSchema>);
			},
		});
}

/**
 * Options for the bodyFieldSerializer factory function
 */
export type BodyFieldSerializerOptions<
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
 * Body field serializer: one field becomes the markdown body.
 *
 * Use when your table has a main content field (like `content`, `body`, or `markdown`)
 * that should be stored as the markdown body rather than in frontmatter.
 *
 * @param bodyField - The field name that should become the markdown body
 * @param options - Optional configuration for null stripping and filename field
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     articles: { serializer: bodyFieldSerializer('content') },
 *     posts: { serializer: bodyFieldSerializer('markdown') },
 *     journal: { serializer: bodyFieldSerializer('content', { stripNulls: false }) },
 *   }
 * })
 * ```
 */
export function bodyFieldSerializer<TTableSchema extends TableSchema>(
	bodyField: keyof TTableSchema & string,
	options: BodyFieldSerializerOptions<TTableSchema> = {},
): MarkdownSerializer<TTableSchema> {
	const {
		stripNulls = true,
		filenameField = 'id' as keyof TTableSchema & string,
	} = options;

	return defineSerializer<TTableSchema>()
		.withParser((filename: `${string}.md`) => {
			const id = path.basename(filename, '.md');
			return { id };
		})
		.withCodecs({
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

			fromContent: ({ frontmatter, body, parsed, table }) => {
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

/**
 * Options for the titleFilenameSerializer factory function
 */
export type TitleFilenameSerializerOptions = {
	/**
	 * Strip null values from frontmatter for cleaner YAML output.
	 * Nullable fields are restored via arktype's .default(null) during deserialization.
	 * @default true
	 */
	stripNulls?: boolean;

	/**
	 * Maximum characters for the title portion of the filename.
	 * @default 80
	 */
	maxTitleLength?: number;
};

/**
 * Title filename serializer: `{title}-{id}.md` filename pattern.
 *
 * Creates filenames with the title for readability while maintaining
 * the ID suffix for uniqueness. Provides:
 * - Readability: Title comes first for easy scanning in file browsers
 * - Uniqueness: ID suffix guarantees no filename collisions
 * - Sorting: Files sort alphabetically by title
 *
 * @param titleField - The field to use for the readable part of the filename
 * @param options - Optional configuration for null stripping and max title length
 *
 * @example
 * ```typescript
 * markdownProvider(c, {
 *   tableConfigs: {
 *     tabs: { serializer: titleFilenameSerializer('title') },
 *     notes: { serializer: titleFilenameSerializer('name', { maxTitleLength: 50 }) },
 *   }
 * })
 * ```
 */
export function titleFilenameSerializer<TTableSchema extends TableSchema>(
	titleField: keyof TTableSchema & string,
	options: TitleFilenameSerializerOptions = {},
): MarkdownSerializer<TTableSchema, ParsedFilename & { titleFromFilename: string }> {
	const { stripNulls = true, maxTitleLength = 80 } = options;

	return defineSerializer<TTableSchema>()
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
		.withCodecs({
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

			fromContent: ({ frontmatter, parsed, table }) => {
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
