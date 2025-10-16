import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { Type } from 'typebox';
import { Ok } from 'wellcrafted/result';
import * as Y from 'yjs';
import {
	boolean,
	markdownIndex,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	createWorkspaceClient,
	text,
	multiSelect,
} from '../../src/index';
import { parseMarkdownWithValidation } from '../../src/indexes/markdown/parser';
import { writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

describe('Markdown Bidirectional Sync', () => {
	const testStoragePath = './test-data/markdown-bidirectional';

	// Define a simple workspace for testing
	const testWorkspace = defineWorkspace({
		id: 'markdown-test',
		version: 1,
		name: 'markdown-test',

		schema: {
			notes: {
				id: id(),
				title: text(),
				content: text({ nullable: true }),
				tags: multiSelect({
					options: ['important', 'draft', 'archived'],
					default: [],
				}),
				count: integer({ default: 0 }),
			},
		},

		indexes: ({ db }) => ({
			markdown: markdownIndex({
				db,
				storagePath: testStoragePath,
			}),
		}),

		actions: ({ db }) => ({
			createNote: defineMutation({
				input: Type.Object({
					title: Type.String({ minLength: 1 }),
					content: Type.Optional(Type.String()),
					tags: Type.Optional(
						Type.Array(
							Type.Union([
								Type.Literal('important'),
								Type.Literal('draft'),
								Type.Literal('archived'),
							]),
						),
					),
				}),
				handler: async (input) => {
					const note = {
						id: generateId(),
						title: input.title,
						content: input.content ?? '',
						tags: Y.Array.from(input.tags ?? []),
						count: 0,
					} as const;
					db.tables.notes.insert(note);
					return Ok(note);
				},
			}),

			getNote: defineQuery({
				input: Type.Object({
					id: Type.String(),
				}),
				handler: async ({ id }) => {
					const result = db.tables.notes.get(id);
					if (result.status === 'valid') {
						return Ok(result.row);
					}
					return Ok(null);
				},
			}),
		}),
	});

	let workspace: ReturnType<typeof createWorkspaceClient<typeof testWorkspace>>;

	beforeEach(() => {
		workspace = createWorkspaceClient(testWorkspace);
	});

	afterEach(async () => {
		// Clean up test data
		await rm(testStoragePath, { recursive: true, force: true });
	});

	test('markdown file changes sync to YJS', async () => {
		// Step 1: Create a note via YJS
		const { data: note } = await workspace.createNote({
			title: 'Test Note',
			content: 'Original content',
			tags: ['draft'],
		});

		expect(note).toBeDefined();
		const noteId = note!.id;

		// Wait a bit for file to be written
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Step 2: Manually edit the markdown file
		const filePath = path.join(testStoragePath, 'notes', `${noteId}.md`);

		// Read the original file first to ensure it was written
		const originalFile = await Bun.file(filePath).text();
		expect(originalFile).toContain('Test Note');

		const newContent = `---
id: ${noteId}
title: Updated Title
content: Updated content
tags:
  - important
  - draft
count: 42
---
Some markdown content here`;

		await writeFile(filePath, newContent);

		// Wait longer for file watcher to process the change
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Step 3: Verify changes are reflected in YJS
		const { data: updatedNote } = await workspace.getNote({ id: noteId });
		expect(updatedNote).toBeDefined();
		expect(updatedNote?.title).toBe('Updated Title');
		expect(updatedNote?.content).toBe('Updated content');
		expect(updatedNote?.tags.toArray()).toEqual(['important', 'draft']);
		expect(updatedNote?.count).toBe(42);
	});

	test('granular Y.Array updates preserve CRDT properties', async () => {
		// Step 1: Create a note with tags
		const { data: note } = await workspace.createNote({
			title: 'Tag Test',
			tags: ['draft', 'important'],
		});

		expect(note).toBeDefined();
		const noteId = note!.id;

		// Wait for file to be written
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Step 2: Update markdown file with modified tags (add one, keep one)
		const filePath = path.join(testStoragePath, 'notes', `${noteId}.md`);
		const newContent = `---
id: ${noteId}
title: Tag Test
content: ""
tags:
  - draft
  - archived
count: 0
---
`;

		await writeFile(filePath, newContent);

		// Wait longer for file watcher to process
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Step 3: Verify tags were updated with granular diff
		const { data: updatedNote } = await workspace.getNote({ id: noteId });
		expect(updatedNote).toBeDefined();
		expect(updatedNote?.tags.toArray()).toEqual(['draft', 'archived']);
	});

	test('parseMarkdownWithValidation handles invalid YAML', async () => {
		const { mkdir } = await import('node:fs/promises');
		const notesDir = path.join(testStoragePath, 'notes');
		await mkdir(notesDir, { recursive: true });

		const testFilePath = path.join(notesDir, 'invalid.md');
		const invalidContent = `---
id: test
title: "Unterminated string
---`;

		await writeFile(testFilePath, invalidContent);

		const result = await parseMarkdownWithValidation(
			testFilePath,
			testWorkspace.schema.notes,
		);

		expect(result.status).toBe('failed-to-parse');
	});

	test('parseMarkdownWithValidation handles schema mismatches', async () => {
		const { mkdir } = await import('node:fs/promises');
		const notesDir = path.join(testStoragePath, 'notes');
		await mkdir(notesDir, { recursive: true });

		const testFilePath = path.join(notesDir, 'mismatch.md');
		const mismatchContent = `---
id: test
title: 123
content: "Valid content"
tags: []
count: 0
---
`;

		await writeFile(testFilePath, mismatchContent);

		const result = await parseMarkdownWithValidation(
			testFilePath,
			testWorkspace.schema.notes,
		);

		expect(result.status).toBe('failed-to-validate');
	});
});
