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
 * - `deserialize`: Converts { frontmatter, body, filename } back to a row (with validation)
 * - `extractRowIdFromFilename`: Extracts the row ID from a filename (for file deletion/orphan cleanup)
 *
 * These three functions MUST be provided together or not at all. This ensures consistency
 * between how files are written and how they're read back.
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
import { MarkdownProviderErr, type MarkdownProviderError } from './markdown-provider';

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
 * Deserialize function signature
 */
type DeserializeFn<TTableSchema extends TableSchema> = (params: {
	frontmatter: Record<string, unknown>;
	body: string;
	filename: string;
	table: TableHelper<TTableSchema>;
}) => Result<SerializedRow<TTableSchema>, MarkdownProviderError>;

/**
 * Extract row ID from filename function signature
 */
type ExtractRowIdFn = (filename: string) => string | undefined;

/**
 * Custom serialization/deserialization behavior for a table.
 *
 * Defines how rows are converted to markdown files and vice versa.
 * When not provided, uses default behavior.
 *
 * ## Type Constraint
 *
 * The three functions (serialize, deserialize, extractRowIdFromFilename) must be
 * provided together or not at all. This ensures consistency:
 *
 * - `serialize` determines the filename format
 * - `deserialize` must understand that format to extract the row ID
 * - `extractRowIdFromFilename` must use the same ID extraction logic for file operations
 *
 * Valid configurations:
 * - `{}` - Use all defaults
 * - `{ directory }` - Custom directory, default serialize/deserialize
 * - `{ serialize, deserialize, extractRowIdFromFilename }` - All custom (required pairing)
 *
 * Invalid configurations (compile error):
 * - `{ serialize }` - Missing deserialize and extractRowIdFromFilename
 * - `{ deserialize }` - Missing serialize and extractRowIdFromFilename
 * - `{ serialize, deserialize }` - Missing extractRowIdFromFilename
 */
export type TableMarkdownConfig<TTableSchema extends TableSchema> = {
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
			 * Use all defaults for serialize/deserialize/extractRowIdFromFilename.
			 *
			 * Default behavior:
			 * - Serialize: All fields except id → frontmatter, empty body, filename "{id}.md"
			 * - Deserialize: Extract ID from filename (strip .md), validate frontmatter against schema
			 * - ExtractRowIdFromFilename: Strip .md extension
			 */
			serialize?: undefined;
			deserialize?: undefined;
			extractRowIdFromFilename?: undefined;
	  }
	| {
			/**
			 * Serialize a row to markdown frontmatter, body, and filename.
			 *
			 * IMPORTANT: The filename MUST be a simple filename without path separators.
			 * The table's directory setting determines where the file is written.
			 *
			 * @param params.row - Row to serialize (already validated against schema)
			 * @param params.table - TableHelper with metadata (name, schema, validators)
			 * @returns Frontmatter object, markdown body string, and simple filename
			 */
			serialize: SerializeFn<TTableSchema>;

			/**
			 * Deserialize markdown frontmatter and body back to a full row.
			 *
			 * @param params.frontmatter - Parsed YAML frontmatter as a plain object
			 * @param params.body - Markdown body content (text after frontmatter delimiters)
			 * @param params.filename - Simple filename only (validated to not contain path separators)
			 * @param params.table - TableHelper with metadata (name, schema, validators)
			 * @returns Result with complete row (with id field), or error to skip this file
			 */
			deserialize: DeserializeFn<TTableSchema>;

			/**
			 * Extract the row ID from a filename.
			 *
			 * Used for file deletions and orphan cleanup where we need to identify
			 * the Y.js row from just the filename (file content is gone).
			 *
			 * This function MUST use the same ID extraction logic as your deserialize function.
			 *
			 * @param filename - Simple filename (e.g., "My Post Title-abc123.md")
			 * @returns The row ID extracted from the filename, or undefined if extraction fails
			 *
			 * @example
			 * // For pattern: "{title}-{id}.md"
			 * extractRowIdFromFilename: (filename) => {
			 *   const basename = path.basename(filename, '.md');
			 *   const lastDash = basename.lastIndexOf('-');
			 *   return lastDash === -1 ? basename : basename.substring(lastDash + 1);
			 * }
			 */
			extractRowIdFromFilename: ExtractRowIdFn;
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
): TableMarkdownConfig<TTableSchema> {
	const { stripNulls = true, maxTitleLength = 80 } = options;

	/**
	 * Extract the row ID from a filename with the pattern: "{title}-{id}.md"
	 * Falls back to treating the entire basename as the ID if no dash is found.
	 */
	const extractRowIdFromFilename = (filename: string): string | undefined => {
		const basename = path.basename(filename, '.md');
		const lastDashIndex = basename.lastIndexOf('-');
		// If no dash found, treat entire basename as ID (fallback to default behavior)
		return lastDashIndex === -1
			? basename
			: basename.substring(lastDashIndex + 1);
	};

	return {
		serialize: ({ row }) => {
			const { id, ...rest } = row;
			const rawTitle = (row[titleField] as string) || '';

			// Use filenamify for robust cross-platform filename sanitization
			// Handles Unicode normalization, grapheme-aware truncation, emoji preservation
			const sanitizedTitle =
				rawTitle.trim() === ''
					? 'Untitled'
					: filenamify(rawTitle, { maxLength: maxTitleLength, replacement: '' });

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

		deserialize: ({ frontmatter, body: _, filename, table }) => {
			// Extract ID from filename using the shared helper
			const id = extractRowIdFromFilename(filename) ?? path.basename(filename, '.md');

			// Combine id with frontmatter
			const data = { id, ...frontmatter };

			// Validate using direct arktype pattern
			const validator = table.validators.toArktype();
			const result = validator(data);

			if (result instanceof type.errors) {
				return MarkdownProviderErr({
					message: `Failed to validate row ${id}`,
					context: {
						fileName: filename,
						id,
						reason: result.summary,
					},
				});
			}

			return Ok(result as SerializedRow<TTableSchema>);
		},

		// Expose the extraction function for unlink fallback
		extractRowIdFromFilename,
	};
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
): TableMarkdownConfig<TTableSchema> {
	const {
		stripNulls = true,
		filenameField = 'id' as keyof TTableSchema & string,
	} = options;

	/**
	 * Extract the row ID from a filename with the pattern: "{id}.md"
	 * The ID is simply the filename without the .md extension.
	 */
	const extractRowIdFromFilename = (filename: string): string | undefined => {
		return path.basename(filename, '.md');
	};

	return {
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

		deserialize: ({ frontmatter, body, filename, table }) => {
			// Extract ID from filename using the shared helper
			const rowId =
				extractRowIdFromFilename(filename) ?? path.basename(filename, '.md');

			// Create validator that omits the body field and filename field
			// Nullable fields that were stripped during serialize are restored via .default(null)
			const FrontMatter = table.validators
				.toArktype()
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				.omit(filenameField as any, bodyField as any);

			const parsed = FrontMatter(frontmatter);

			if (parsed instanceof type.errors) {
				return MarkdownProviderErr({
					message: `Invalid frontmatter for row ${rowId}`,
					context: {
						fileName: filename,
						id: rowId,
						reason: parsed.summary,
					},
				});
			}

			// Reconstruct the full row
			const row = {
				[filenameField]: rowId,
				[bodyField]: body,
				...parsed,
			} as SerializedRow<TTableSchema>;

			return Ok(row);
		},

		// Expose the extraction function for unlink fallback
		extractRowIdFromFilename,
	};
}
