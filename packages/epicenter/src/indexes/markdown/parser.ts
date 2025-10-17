import { tryAsync, Ok, type Result } from 'wellcrafted/result';
import { createTaggedError } from 'wellcrafted/error';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import path from 'node:path';
import { readdir, mkdir } from 'node:fs/promises';
import * as Y from 'yjs';
import type { TableSchema, Row } from '../../core/schema';
import type { RowValidationResult } from '../../core/validation';

/**
 * Result of parsing a markdown file
 */
export type MarkdownData<T = any> = {
	data: T;
	content: string;
	excerpt?: string;
};

/**
 * Error types for markdown operations
 */
export const { MarkdownError, MarkdownErr } =
	createTaggedError('MarkdownError');
export type MarkdownError = ReturnType<typeof MarkdownError>;

/**
 * Parse a markdown file with frontmatter
 */
export async function parseMarkdownFile<T>(
	filePath: string,
): Promise<Result<MarkdownData<T>, MarkdownError>> {
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

			// Parse frontmatter manually
			// Check if file starts with ---
			if (!content.startsWith('---\n')) {
				throw new Error(`No frontmatter found in markdown file: ${filePath}`);
			}

			// Find the end of frontmatter
			const endIndex = content.indexOf('\n---\n', 4);
			if (endIndex === -1) {
				throw new Error(`Invalid frontmatter format in file: ${filePath}`);
			}

			// Extract frontmatter and content
			const frontmatterYaml = content.slice(4, endIndex);
			const markdownContent = content.slice(endIndex + 5).trim();

			// Parse YAML frontmatter
			const data = parseYaml(frontmatterYaml) as T;

			if (
				!data ||
				(typeof data === 'object' && Object.keys(data).length === 0)
			) {
				throw new Error(`No frontmatter data found in file: ${filePath}`);
			}

			// Extract excerpt if separator exists
			let excerpt: string | undefined;
			const excerptSeparator = '<!-- more -->';
			const excerptIndex = markdownContent.indexOf(excerptSeparator);
			if (excerptIndex !== -1) {
				excerpt = markdownContent.slice(0, excerptIndex).trim();
			}

			return {
				data,
				content: markdownContent,
				excerpt,
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
 * Write a markdown file with frontmatter
 */
export async function writeMarkdownFile<T = any>(
	filePath: string,
	data: T,
	content = '',
): Promise<Result<void, MarkdownError>> {
	return tryAsync({
		try: async () => {
			// Ensure directory exists
			const dir = path.dirname(filePath);
			await tryAsync({
				try: async () => {
					// Try to create directory if it doesn't exist
					await mkdir(dir, { recursive: true });
				},
				catch: () => Ok(undefined), // Directory might already exist, that's fine
			});

			// Serialize YJS types to plain values before writing to YAML
			const serializedData: Record<string, any> = {};
			for (const [key, value] of Object.entries(data as Record<string, any>)) {
				if (value instanceof Y.Text) {
					serializedData[key] = value.toString();
				} else if (value instanceof Y.Array) {
					serializedData[key] = value.toArray();
				} else {
					serializedData[key] = value;
				}
			}

			// Create markdown content with frontmatter
			const yamlContent = stringifyYaml(serializedData);
			const markdown = `---\n${yamlContent}---\n${content}`;

			// Write file using Bun.write
			await Bun.write(filePath, markdown);
		},
		catch: (error) =>
			MarkdownErr({
				message: `Failed to write markdown file ${filePath}: ${error}`,
				context: { filePath },
				cause: error,
			}),
	});
}

/**
 * Update a markdown file's frontmatter while preserving content
 */
export async function updateMarkdownFile<T = any>(
	filePath: string,
	data: Partial<T>,
): Promise<Result<void, MarkdownError>> {
	return tryAsync({
		try: async () => {
			// Read existing file
			const existingResult = await parseMarkdownFile<T>(filePath);

			if (existingResult.error) {
				throw new Error(`Failed to read existing file: ${filePath}`);
			}

			const existing = existingResult.data;

			// Merge data
			const newData = { ...existing.data, ...data };

			// Write back
			const writeResult = await writeMarkdownFile(
				filePath,
				newData,
				existing.content,
			);
			if (writeResult.error) {
				throw new Error(`Failed to write file: ${writeResult.error.message}`);
			}
			// writeResult.data is void, so just return success (implicitly returns undefined)
		},
		catch: (error) =>
			MarkdownErr({
				message: `Failed to update markdown file ${filePath}: ${error}`,
				context: { filePath },
				cause: error,
			}),
	});
}

/**
 * Delete a markdown file
 */
export async function deleteMarkdownFile(
	filePath: string,
): Promise<Result<void, MarkdownError>> {
	return tryAsync({
		try: async () => {
			const file = Bun.file(filePath);
			const exists = await file.exists();

			if (!exists) {
				// File doesn't exist, consider it a success - just return
				return;
			}

			// Use Bun.$ to remove the file
			await Bun.$`rm -f ${filePath}`.quiet();
		},
		catch: (error) => {
			// If file doesn't exist, consider it a success
			if ((error as any)?.code === 'ENOENT') {
				return Ok(undefined);
			}

			console.warn(`Could not delete markdown file ${filePath}:`, error);
			// Return Ok anyway as deletion failures are often not critical
			return Ok(undefined);
		},
	});
}

/**
 * List all markdown files in a directory
 */
export async function listMarkdownFiles(
	directory: string,
	recursive = true,
): Promise<Result<string[], MarkdownError>> {
	const files: string[] = [];

	async function scanDir(dir: string) {
		await tryAsync({
			try: async () => {
				const entries = await readdir(dir, { withFileTypes: true });

				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name);

					if (entry.isDirectory() && recursive) {
						await scanDir(fullPath);
					} else if (entry.isFile() && entry.name.endsWith('.md')) {
						files.push(fullPath);
					}
				}
			},
			catch: (error) => {
				// Ignore errors for inaccessible directories
				console.warn(`Could not read directory ${dir}:`, error);
				return Ok(undefined);
			},
		});
	}

	await scanDir(directory);
	return Ok(files);
}

/**
 * Get the file path for a table record
 */
export function getMarkdownPath(
	vaultPath: string,
	tableName: string,
	id: string,
): string {
	// Sanitize ID for filesystem
	const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
	return path.join(vaultPath, tableName, `${safeId}.md`);
}

/**
 * Extract table name and ID from a markdown file path
 */
export function parseMarkdownPath(
	vaultPath: string,
	filePath: string,
): { tableName: string; id: string } | null {
	const relative = path.relative(vaultPath, filePath);
	const parts = relative.split(path.sep);

	if (parts.length !== 2) {
		return null;
	}

	const [tableName, filename] = parts;
	if (!tableName || !filename) {
		return null;
	}
	const id = filename.replace(/\.md$/, '');

	return { tableName, id };
}

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
	const parseResult = await parseMarkdownFile<unknown>(filePath);

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
	const row = data as Record<string, any>;
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

	return {
		status: 'success',
		data: row as T,
		content,
	};
}
