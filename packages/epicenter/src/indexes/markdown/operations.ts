import { createTaggedError } from 'wellcrafted/error';
import { type Result, tryAsync } from 'wellcrafted/result';

export const { MarkdownOperationError, MarkdownOperationErr } =
	createTaggedError('MarkdownOperationError');
export type MarkdownOperationError = ReturnType<typeof MarkdownOperationError>;

export async function writeMarkdownFile({
	filePath,
	frontmatter,
	body,
}: {
	filePath: string;
	frontmatter: Record<string, unknown>;
	body: string;
}): Promise<Result<void, MarkdownOperationError>> {
	return tryAsync({
		try: async () => {
			// Create markdown file with frontmatter and body
			const yamlContent = Bun.YAML.stringify(frontmatter, null, 2);
			const markdown = `---\n${yamlContent}\n---\n${body}`;

			// Write file (Bun.write creates parent directories by default)
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
