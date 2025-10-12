import { tryAsync, Ok, type Result } from 'wellcrafted/result';
import { createTaggedError } from 'wellcrafted/error';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import path from 'node:path';
import { readdir, mkdir } from 'node:fs/promises';

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

			// Create markdown content with frontmatter
			const yamlContent = stringifyYaml(data);
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
