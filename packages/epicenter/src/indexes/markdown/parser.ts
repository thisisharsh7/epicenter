import { createTaggedError, extractErrorMessage } from 'wellcrafted/error';
import { type Result, tryAsync } from 'wellcrafted/result';

/**
 * Error types for markdown operations
 */
export const { MarkdownError, MarkdownErr } =
	createTaggedError('MarkdownError');
export type MarkdownError = ReturnType<typeof MarkdownError>;

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
				message: `Failed to parse markdown file ${filePath}: ${extractErrorMessage(error)}`,
				context: { filePath },
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
