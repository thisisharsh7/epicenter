import matter from 'gray-matter';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Result of parsing a markdown file
 */
export type MarkdownParseResult<T = any> =
	| { success: true; data: T; content: string; excerpt?: string }
	| { success: false; error: MarkdownParseError };

/**
 * Types of errors that can occur during markdown parsing
 */
export type MarkdownParseError =
	| { type: 'file-not-found'; path: string; error: Error }
	| { type: 'read-error'; path: string; error: Error }
	| { type: 'parse-error'; path: string; error: Error }
	| { type: 'frontmatter-invalid'; path: string; error: Error };

/**
 * Parse a markdown file with frontmatter
 */
export async function parseMarkdownFile<T = any>(
	filePath: string,
): Promise<MarkdownParseResult<T>> {
	try {
		// Check if file exists
		try {
			await fs.access(filePath);
		} catch (error) {
			return {
				success: false,
				error: {
					type: 'file-not-found',
					path: filePath,
					error: error as Error,
				},
			};
		}

		// Read file content
		let content: string;
		try {
			content = await fs.readFile(filePath, 'utf-8');
		} catch (error) {
			return {
				success: false,
				error: {
					type: 'read-error',
					path: filePath,
					error: error as Error,
				},
			};
		}

		// Parse with gray-matter
		let parsed: matter.GrayMatterFile<string>;
		try {
			parsed = matter(content, {
				excerpt: true,
				excerpt_separator: '<!-- more -->',
			});
		} catch (error) {
			return {
				success: false,
				error: {
					type: 'parse-error',
					path: filePath,
					error: error as Error,
				},
			};
		}

		// Validate frontmatter exists
		if (!parsed.data || Object.keys(parsed.data).length === 0) {
			return {
				success: false,
				error: {
					type: 'frontmatter-invalid',
					path: filePath,
					error: new Error('No frontmatter found in markdown file'),
				},
			};
		}

		return {
			success: true,
			data: parsed.data as T,
			content: parsed.content,
			excerpt: parsed.excerpt,
		};
	} catch (error) {
		return {
			success: false,
			error: {
				type: 'parse-error',
				path: filePath,
				error: error as Error,
			},
		};
	}
}

/**
 * Write a markdown file with frontmatter
 */
export async function writeMarkdownFile<T = any>(
	filePath: string,
	data: T,
	content = '',
): Promise<{ success: boolean; error?: Error }> {
	try {
		// Ensure directory exists
		const dir = path.dirname(filePath);
		await fs.mkdir(dir, { recursive: true });

		// Create markdown content with frontmatter
		const markdown = matter.stringify(content, data);

		// Write file
		await fs.writeFile(filePath, markdown, 'utf-8');

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error as Error,
		};
	}
}

/**
 * Update a markdown file's frontmatter while preserving content
 */
export async function updateMarkdownFile<T = any>(
	filePath: string,
	data: Partial<T>,
): Promise<{ success: boolean; error?: Error }> {
	try {
		// Read existing file
		const existing = await parseMarkdownFile<T>(filePath);

		if (!existing.success) {
			return {
				success: false,
				error: new Error(
					`Failed to read existing file: ${existing.error.type}`,
				),
			};
		}

		// Merge data
		const newData = { ...existing.data, ...data };

		// Write back
		return await writeMarkdownFile(filePath, newData, existing.content);
	} catch (error) {
		return {
			success: false,
			error: error as Error,
		};
	}
}

/**
 * Delete a markdown file
 */
export async function deleteMarkdownFile(
	filePath: string,
): Promise<{ success: boolean; error?: Error }> {
	try {
		await fs.unlink(filePath);
		return { success: true };
	} catch (error) {
		// If file doesn't exist, consider it a success
		if ((error as any).code === 'ENOENT') {
			return { success: true };
		}
		return {
			success: false,
			error: error as Error,
		};
	}
}

/**
 * List all markdown files in a directory
 */
export async function listMarkdownFiles(
	directory: string,
	recursive = true,
): Promise<string[]> {
	const files: string[] = [];

	async function scanDir(dir: string) {
		try {
			const entries = await fs.readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);

				if (entry.isDirectory() && recursive) {
					await scanDir(fullPath);
				} else if (entry.isFile() && entry.name.endsWith('.md')) {
					files.push(fullPath);
				}
			}
		} catch (error) {
			// Ignore errors for inaccessible directories
			console.warn(`Could not read directory ${dir}:`, error);
		}
	}

	await scanDir(directory);
	return files;
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
	const id = filename.replace(/\.md$/, '');

	return { tableName, id };
}
