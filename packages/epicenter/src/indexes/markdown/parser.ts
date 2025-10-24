import path from 'node:path';
import { createTaggedError } from 'wellcrafted/error';
import { type Result, tryAsync } from 'wellcrafted/result';
import * as Y from 'yjs';
import type {
	CellValue,
	Row,
	RowValidationResult,
	SerializedRow,
	TableSchema,
} from '../../core/schema';
import { createRow, isSerializedRow } from '../../core/schema';
import type { YRow } from '../../db/table-helper';
import { updateYRowFromSerializedRow } from '../../utils/yjs';

/**
 * Error types for markdown operations
 */
export const { MarkdownError, MarkdownErr } =
	createTaggedError('MarkdownError');
export type MarkdownError = ReturnType<typeof MarkdownError>;

/**
 * Result of parsing and validating a markdown file.
 * Combines parse errors with row validation results.
 *
 * Four possible outcomes:
 * - failed-to-parse: YAML frontmatter has invalid syntax or file is malformed
 * - invalid-structure: YAML parsed but not a valid object structure
 * - schema-mismatch: Valid structure but doesn't match table schema
 * - valid: File parsed and validated successfully
 */
export type ParseMarkdownResult<T extends Row = Row> =
	| {
			/**
			 * Failed to parse the markdown file or YAML frontmatter
			 */
			status: 'failed-to-parse';
			/**
			 * Error containing details about the parse failure
			 * (e.g., invalid YAML syntax, file not found, malformed frontmatter)
			 */
			error: MarkdownError;
	  }
	| RowValidationResult<T>;

/**
 * Parse and validate a markdown file against a table schema.
 * Returns a discriminated union indicating success or specific failure mode.
 *
 * If a bodyField is provided, the markdown content (after frontmatter) will be
 * merged into the row data at that field name before validation.
 *
 * If an existing yrow is provided, it will be updated with minimal diffs.
 * Otherwise, a new YRow is created.
 *
 * @param filePath - Path to the markdown file
 * @param schema - Table schema to validate against
 * @param bodyField - Optional field name to store markdown body content
 * @param yrow - Optional existing YRow to update (if omitted, creates new YRow)
 * @returns ParseMarkdownResult with status and data/error
 */
export async function parseMarkdownWithValidation<
	TTableSchema extends TableSchema,
>({
	filePath,
	schema,
	bodyField,
	yrow,
}: {
	filePath: string;
	schema: TTableSchema;
	bodyField?: string;
	yrow?: YRow;
}): Promise<ParseMarkdownResult<Row<TTableSchema>>> {
	// Step 1: Parse the markdown file
	const parseResult = await parseMarkdownFile(filePath);

	if (parseResult.error) {
		return {
			status: 'failed-to-parse',
			error: parseResult.error,
		};
	}

	const { data, content } = parseResult.data;

	// Step 2: Validate that parsed data is a valid SerializedRow
	if (!isSerializedRow(data)) {
		return {
			status: 'invalid-structure',
			row: data,
			reason: {
				type: 'not-an-object',
				actual: data,
			},
		};
	}

	// Step 3: Merge markdown body content into row data at the bodyField (if provided)
	const serializedRow = bodyField ? { ...data, [bodyField]: content } : data;

	// Step 4: Update existing YRow or create a new one
	const targetYRow = yrow ?? new Y.Map<CellValue>();
	updateYRowFromSerializedRow({ yrow: targetYRow, serializedRow, schema });

	// Step 5: Create Row proxy and validate
	const row = createRow({ yrow: targetYRow, schema });
	return row.validate();
}

/**
 * Parse a markdown file with optional frontmatter
 * If file has no frontmatter (doesn't start with ---), treats entire file as content
 */
async function parseMarkdownFile(filePath: string): Promise<
	Result<
		{
			data: unknown;
			content: string;
		},
		MarkdownError
	>
> {
	return tryAsync({
		try: async () => {
			const file = Bun.file(filePath);

			// Check if file exists
			const exists = await file.exists();
			if (!exists) {
				throw new Error(`File not found: ${filePath}`);
			}

			// Read file content
			const content = await file.text();

			// Check if file has frontmatter
			if (!content.startsWith('---\n')) {
				// No frontmatter: treat entire file as content
				return {
					data: {},
					content: content.trim(),
				};
			}

			// Find the end of frontmatter
			const endIndex = content.indexOf('\n---\n', 4);
			if (endIndex === -1) {
				throw new Error(`Invalid frontmatter format in file: ${filePath}`);
			}

			// Extract frontmatter and content
			const frontmatterYaml = content.slice(4, endIndex);
			const markdownContent = content.slice(endIndex + 5).trim();

			// Parse YAML frontmatter using Bun's built-in YAML parser
			// Bun.YAML.parse can return:
			// - Object: normal case with frontmatter fields (e.g., { title: "...", tags: [...] })
			// - null: empty YAML, whitespace-only, or no content between --- delimiters
			// - Primitives: number, string, boolean (if YAML is just a scalar value)
			// - Array: if YAML is just an array
			// For now, return whatever YAML gives us and validate structure later
			const data = Bun.YAML.parse(frontmatterYaml);

			return {
				data,
				content: markdownContent,
			};
		},
		catch: (error) =>
			MarkdownErr({
				message: `Failed to parse markdown file ${filePath}: ${error}`,
				context: { filePath },
				cause: error,
			}),
	});
}
