/**
 * @fileoverview Markdown Table Config Factory Functions
 *
 * This file provides convenience factory functions for creating `TableMarkdownConfig` objects,
 * which define how rows are serialized to markdown files and deserialized back.
 *
 * ## Contract
 *
 * All factory functions return a `TableMarkdownConfig<TTableSchema>` with:
 * - `serialize`: Converts a row to { frontmatter, body, filename }
 * - `deserialize`: Converts { frontmatter, body, filename } back to a row (with validation)
 *
 * ## Available Factories
 *
 * - `withBodyField(field)`: Common pattern where one field becomes the markdown body.
 *
 * The true default config (`DEFAULT_TABLE_CONFIG`) is defined in `markdown-provider.ts`.
 *
 * ## Usage
 *
 * ```typescript
 * import { markdownProvider, withBodyField, DEFAULT_TABLE_CONFIG } from '@epicenter/hq';
 *
 * markdownProvider(c, {
 *   tableConfigs: {
 *     // Use the default (all in frontmatter) - imported from markdown-provider
 *     settings: DEFAULT_TABLE_CONFIG,
 *
 *     // Use a convenience helper (content → body)
 *     articles: withBodyField('content'),
 *     posts: withBodyField('markdown'),
 *
 *     // With options
 *     journal: withBodyField('content', { stripNulls: false }),
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
 * Common fields that are always optional and independent
 */
type TableMarkdownConfigBase<TTableSchema extends TableSchema> = {
	/**
	 * Directory for this table's markdown files.
	 *
	 * **Optional**: Defaults to the table name
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

	/**
	 * Serialize a row to markdown frontmatter, body, and filename.
	 *
	 * **Optional**: When not provided, uses default behavior:
	 * - All fields except id go to frontmatter
	 * - Empty body
	 * - Filename: `{id}.md`
	 *
	 * IMPORTANT: The filename MUST be a simple filename without path separators.
	 * The table's directory setting determines where the file is written.
	 *
	 * @param params.row - Row to serialize (already validated against schema)
	 * @param params.table - TableHelper with metadata (name, schema, validators) and type inference helpers
	 * @returns Frontmatter object, markdown body string, and simple filename (without directory path)
	 */
	serialize?(params: {
		row: SerializedRow<TTableSchema>;
		table: TableHelper<TTableSchema>;
	}): {
		frontmatter: Record<string, unknown>;
		body: string;
		filename: string;
	};
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
 * If you provide a custom `deserialize` function, you MUST also provide
 * `extractRowIdFromFilename`. This ensures consistent ID extraction logic
 * between deserialization and file operations (deletion, orphan cleanup).
 *
 * Valid configurations:
 * - `{}` - Use all defaults
 * - `{ serialize }` - Custom serialize, default deserialize
 * - `{ extractRowIdFromFilename }` - Custom ID extraction, default deserialize
 * - `{ deserialize, extractRowIdFromFilename }` - Both custom (required pairing)
 *
 * Invalid configuration (compile error):
 * - `{ deserialize }` - Missing extractRowIdFromFilename
 */
export type TableMarkdownConfig<TTableSchema extends TableSchema> =
	TableMarkdownConfigBase<TTableSchema> &
		(
			| {
					/**
					 * Use default deserialize and extractRowIdFromFilename.
					 * Default deserialize extracts ID from filename (strips .md extension).
					 */
					deserialize?: undefined;
					extractRowIdFromFilename?: undefined;
			  }
			| {
					/**
					 * Custom ID extraction with default deserialize.
					 * Useful when you have a custom filename pattern but default deserialization works.
					 */
					deserialize?: undefined;
					/**
					 * Extract the row ID from a filename.
					 *
					 * Used for file deletions and orphan cleanup where we need to identify
					 * the Y.js row from just the filename.
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
			| {
					/**
					 * Deserialize markdown frontmatter and body back to a full row.
					 *
					 * **IMPORTANT**: When providing custom deserialize, you MUST also provide
					 * extractRowIdFromFilename with matching ID extraction logic.
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
					 * **REQUIRED** when providing custom deserialize to ensure consistent
					 * ID extraction between deserialization and file operations.
					 *
					 * This function MUST use the same ID extraction logic as your deserialize function.
					 *
					 * @param filename - Simple filename (e.g., "My Post Title-abc123.md")
					 * @returns The row ID extracted from the filename, or undefined if extraction fails
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
