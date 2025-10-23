import path from 'node:path';
import { createTaggedError } from 'wellcrafted/error';
import { tryAsync, type Result } from 'wellcrafted/result';
import * as Y from 'yjs';
import type { Row, TableSchema } from '../../core/schema';
import type { RowValidationResult } from '../../core/validation';


/**
 * Error types for markdown operations
 */
export const { MarkdownError, MarkdownErr } =
	createTaggedError('MarkdownError');
export type MarkdownError = ReturnType<typeof MarkdownError>;


/**
 * Result of parsing and validating a markdown file
 * Three possible outcomes:
 * - failed-to-parse: YAML frontmatter has invalid syntax or file is malformed
 * - failed-to-validate: YAML parsed successfully but doesn't match table schema
 * - success: File parsed and validated successfully
 */
export type ParseMarkdownResult<T extends Row = Row> =
	| {
		status: 'failed-to-parse';
		error: MarkdownError;
	}
	| {
		status: 'failed-to-validate';
		validationResult: RowValidationResult<T>;
		data: unknown;
	}
	| {
		status: 'success';
		data: T;
		content: string;
	};

/**
 * Parse and validate a markdown file against a table schema
 * Returns a discriminated union indicating success or specific failure mode
 *
 * @param filePath - Path to the markdown file
 * @param schema - Table schema to validate against
 * @returns ParseMarkdownResult with status and data/error
 */
export async function parseMarkdownWithValidation<T extends Row>(
	filePath: string,
	schema: TableSchema,
): Promise<ParseMarkdownResult<T>> {
	// Step 1: Parse the markdown file
	const parseResult = await parseMarkdownFile(filePath);

	if (parseResult.error) {
		return {
			status: 'failed-to-parse',
			error: parseResult.error,
		};
	}

	const { data, content } = parseResult.data;

	// Step 2: Validate structural correctness (not schema)
	// We validate that data is an object with basic types, but we allow plain values
	// for ytext and multi-select columns (strings and arrays) because that's what YAML gives us
	if (typeof data !== 'object' || data === null || Array.isArray(data)) {
		return {
			status: 'failed-to-validate',
			validationResult: {
				status: 'invalid-structure',
				row: data,
				reason: { type: 'not-an-object', actual: data },
			},
			data,
		};
	}

	// Step 3: Validate required fields and types, accepting plain values for YJS types
	// Preserve all fields from frontmatter (including extra fields not in schema)
	const row = data as Record<string, any>;
	const validatedRow: Record<string, any> = { ...row };

	// Validate schema fields
	for (const [fieldName, columnSchema] of Object.entries(schema)) {
		const value = row[fieldName];

		// Check required fields
		if (value === null || value === undefined) {
			if (columnSchema.type === 'id' || !columnSchema.nullable) {
				return {
					status: 'failed-to-validate',
					validationResult: {
						status: 'schema-mismatch',
						row: row as Row,
						reason: { type: 'missing-required-field', field: fieldName },
					},
					data,
				};
			}
			continue;
		}

		// Type validation (accept plain values for ytext and multi-select)
		switch (columnSchema.type) {
			case 'id':
			case 'text':
				if (typeof value !== 'string') {
					return {
						status: 'failed-to-validate',
						validationResult: {
							status: 'schema-mismatch',
							row: row as Row,
							reason: {
								type: 'type-mismatch',
								field: fieldName,
								schemaType: columnSchema.type,
								actual: value,
							},
						},
						data,
					};
				}
				break;

			case 'ytext':
				// Accept both Y.Text and plain string
				if (!(value instanceof Y.Text) && typeof value !== 'string') {
					return {
						status: 'failed-to-validate',
						validationResult: {
							status: 'schema-mismatch',
							row: row as Row,
							reason: {
								type: 'type-mismatch',
								field: fieldName,
								schemaType: columnSchema.type,
								actual: value,
							},
						},
						data,
					};
				}
				break;

			case 'multi-select':
				// Accept both Y.Array and plain array
				if (!(value instanceof Y.Array) && !Array.isArray(value)) {
					return {
						status: 'failed-to-validate',
						validationResult: {
							status: 'schema-mismatch',
							row: row as Row,
							reason: {
								type: 'type-mismatch',
								field: fieldName,
								schemaType: columnSchema.type,
								actual: value,
							},
						},
						data,
					};
				}
				// If it's a plain array, validate options
				if (Array.isArray(value)) {
					for (const option of value) {
						if (typeof option !== 'string') {
							return {
								status: 'failed-to-validate',
								validationResult: {
									status: 'schema-mismatch',
									row: row as Row,
									reason: {
										type: 'type-mismatch',
										field: fieldName,
										schemaType: columnSchema.type,
										actual: option,
									},
								},
								data,
							};
						}
						if (!columnSchema.options.includes(option)) {
							return {
								status: 'failed-to-validate',
								validationResult: {
									status: 'schema-mismatch',
									row: row as Row,
									reason: {
										type: 'invalid-option',
										field: fieldName,
										actual: option,
										allowedOptions: columnSchema.options,
									},
								},
								data,
							};
						}
					}
				}
				break;

			case 'integer':
				if (typeof value !== 'number' || !Number.isInteger(value)) {
					return {
						status: 'failed-to-validate',
						validationResult: {
							status: 'schema-mismatch',
							row: row as Row,
							reason: {
								type: 'type-mismatch',
								field: fieldName,
								schemaType: columnSchema.type,
								actual: value,
							},
						},
						data,
					};
				}
				break;
		}
	}

	// Ensure all schema fields exist in the validated row
	// If a field is missing from frontmatter, set it to null
	for (const fieldName of Object.keys(schema)) {
		if (!(fieldName in validatedRow)) {
			validatedRow[fieldName] = null;
		}
	}

	return {
		status: 'success',
		data: validatedRow as T,
		content,
	};
}

/**
 * Parse a markdown file with optional frontmatter
 * If file has no frontmatter (doesn't start with ---), treats entire file as content
 */
async function parseMarkdownFile(
	filePath: string,
): Promise<Result<{
	data: unknown;
	content: string;
}, MarkdownError>> {
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