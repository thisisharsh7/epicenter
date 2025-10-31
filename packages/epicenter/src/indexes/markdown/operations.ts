import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createTaggedError } from 'wellcrafted/error';
import { Ok, type Result, tryAsync } from 'wellcrafted/result';

export const { MarkdownOperationError, MarkdownOperationErr } =
	createTaggedError('MarkdownOperationError');
export type MarkdownOperationError = ReturnType<typeof MarkdownOperationError>;

export async function writeMarkdownFile({
	filePath,
	frontmatter,
	content,
}: {
	filePath: string;
	frontmatter: Record<string, unknown>;
	content: string;
}): Promise<Result<void, MarkdownOperationError>> {
	// Ensure directory exists
	await tryAsync({
		try: () => mkdir(path.dirname(filePath), { recursive: true }),
		catch: () => Ok(undefined),
	});
	return tryAsync({
		try: async () => {
			// Create markdown content with frontmatter
			const yamlContent = Bun.YAML.stringify(frontmatter, null, 2);
			const markdown = `---\n${yamlContent}\n---\n${content}`;

			// Write file
			await Bun.write(filePath, markdown);
		},
		catch: (error) =>
			MarkdownOperationErr({
				message: `Failed to write markdown file ${filePath}`,
				context: { filePath },
				cause: error,
			}),
	});
}

export async function deleteMarkdownFile({
	filePath,
}: {
	filePath: string;
}): Promise<Result<void, MarkdownOperationError>> {
	return tryAsync({
		try: () => Bun.file(filePath).delete(),
		catch: (error) =>
			MarkdownOperationErr({
				message: `Failed to delete markdown file ${filePath}`,
				context: { filePath },
				cause: error,
			}),
	});
}
