import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { type } from 'arktype';
import { Ok } from 'wellcrafted/result';
import * as Y from 'yjs';
import {
	type WorkspaceClient,
	boolean,
	createWorkspaceClient,
	defineMutation,
	defineQuery,
	defineWorkspace,
	generateId,
	id,
	integer,
	markdownIndex,
	multiSelect,
	text,
} from '../../src/index';

describe('Markdown Bidirectional Sync', () => {
	const testStoragePath = path.join(import.meta.dir, '.data');

	// Define a simple workspace for testing
	const testWorkspace = defineWorkspace({
		id: 'markdown-test',
		version: 1,

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

		indexes: {
			markdown: ({ id, db }) =>
				markdownIndex({
					id,
					db,
					storagePath: testStoragePath,
				}),
		},

		actions: ({ db }) => ({
			createNote: defineMutation({
				input: type({
					title: 'string >= 1',
					'content?': 'string',
					'tags?': "('important' | 'draft' | 'archived')[]",
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
				input: type({
					id: 'string',
				}),
				handler: async ({ id }) => {
					const result = db.tables.notes.get({ id });
					if (result.status === 'valid') {
						return Ok(result.row);
					}
					return Ok(null);
				},
			}),
		}),
	});

	let workspace!: WorkspaceClient<any>;

	beforeEach(async () => {
		workspace = await createWorkspaceClient(testWorkspace);
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

		await Bun.write(filePath, newContent);

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

		await Bun.write(filePath, newContent);

		// Wait longer for file watcher to process
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Step 3: Verify tags were updated with granular diff
		const { data: updatedNote } = await workspace.getNote({ id: noteId });
		expect(updatedNote).toBeDefined();
		expect(updatedNote?.tags.toArray()).toEqual(['draft', 'archived']);
	});
});
