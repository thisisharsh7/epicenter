import { createTaggedError } from 'wellcrafted/error';
import { type Result, tryAsync } from 'wellcrafted/result';
import * as Y from 'yjs';
import type {
	CellValue,
	Row,
	RowValidationResult,
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
 * If a bodyField is provided, the markdown body (after frontmatter) will be
 * merged into the row data at that field name before validation.
 *
 * If an existing yrow is provided, it will be updated with minimal diffs.
 * Otherwise, a new YRow is created.
 *
 * @param filePath - Path to the markdown file
 * @param schema - Table schema to validate against
 * @param bodyField - If provided, merges markdown body content into this field. Otherwise only frontmatter is parsed.
 * @param existingYRow - If provided, updates this YRow with minimal diffs. Otherwise creates new YRow.
 * @returns ParseMarkdownResult with status (failed-to-parse | invalid-structure | schema-mismatch | valid)
 */
export async function parseMarkdownWithValidation<
	TTableSchema extends TableSchema,
>({
	filePath,
	schema,
	bodyField,
	existingYRow,
}: {
	filePath: string;
	schema: TTableSchema;
	bodyField?: string;
	existingYRow?: YRow;
}): Promise<ParseMarkdownResult<Row<TTableSchema>>> {
	// Step 1: Parse the markdown file
	const parseResult = await parseMarkdownFile(filePath);

	if (parseResult.error) {
		return {
			status: 'failed-to-parse',
			error: parseResult.error,
		};
	}

	const { data, body } = parseResult.data;

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

	// Step 3: Merge markdown body into row data at the bodyField (if provided)
	const serializedRow = bodyField ? { ...data, [bodyField]: body } : data;

	// Step 4: Update existing YRow or create a new one
	const targetYRow = existingYRow ?? new Y.Map<CellValue>();
	updateYRowFromSerializedRow({ yrow: targetYRow, serializedRow, schema });

	// Step 5: Create Row proxy and validate
	const row = createRow({ yrow: targetYRow, schema });
	return row;
}

/**
 * Parse a markdown file with optional frontmatter.
 * If file has no frontmatter (doesn't start with ---), treats entire file as body.
 * Does not validate against schema - that's handled by tableConfig.deserialize.
 *
 * @param filePath - Path to the markdown file
 * @returns Result with data (frontmatter as Record<string, unknown>) and body, or error
 */
export async function parseMarkdownFile(filePath: string): Promise<
	Result<
		{
			data: Record<string, unknown>;
			body: string;
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
				// No frontmatter: treat entire file as body
				return {
					data: {},
					body: content.trim(),
				};
			}

			// Find the end of frontmatter
			const endIndex = content.indexOf('\n---\n', 4);
			if (endIndex === -1) {
				throw new Error(`Invalid frontmatter format in file: ${filePath}`);
			}

			// Extract frontmatter and body
			const frontmatterYaml = content.slice(4, endIndex);
			const bodyContent = content.slice(endIndex + 5).trim();

			// Parse YAML frontmatter using Bun's built-in YAML parser
			// Bun.YAML.parse can return:
			// - Object: normal case with frontmatter fields (e.g., { title: "...", tags: [...] })
			// - null: empty YAML, whitespace-only, or no content between --- delimiters
			// - Primitives: number, string, boolean (if YAML is just a scalar value)
			// - Array: if YAML is just an array
			const parsedData = Bun.YAML.parse(frontmatterYaml);

			// Validate that data is a plain object using type guard
			// If it's not a plain object, use empty object instead
			const data = isPlainObject(parsedData) ? parsedData : {};

			return {
				data,
				body: bodyContent,
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

/**
 * Type guard to check if a value is a plain object (Record<string, unknown>)
 * Returns true for plain objects like { foo: 'bar' }
 * Returns false for null, primitives, arrays, Dates, RegExp, Maps, etc.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
