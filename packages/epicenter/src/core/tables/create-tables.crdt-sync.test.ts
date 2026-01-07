import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, text } from '../schema';
import { createTables } from './create-tables';

describe('Cell-Level CRDT Merging', () => {
	test('concurrent edits to different columns merge correctly', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const tables1 = createTables(doc1, {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		});

		const tables2 = createTables(doc2, {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		});

		tables1.posts.upsert({
			id: 'post-1',
			title: 'Original',
			views: 0,
			published: false,
		});

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		const row1Before = tables1.posts.get('post-1');
		const row2Before = tables2.posts.get('post-1');
		expect(row1Before.status).toBe('valid');
		expect(row2Before.status).toBe('valid');
		if (row1Before.status === 'valid' && row2Before.status === 'valid') {
			expect(row1Before.row.title).toBe('Original');
			expect(row2Before.row.title).toBe('Original');
		}

		tables1.posts.update({ id: 'post-1', title: 'Updated by User 1' });
		tables2.posts.update({ id: 'post-1', views: 100 });

		const row1Mid = tables1.posts.get('post-1');
		const row2Mid = tables2.posts.get('post-1');
		expect(row1Mid.status).toBe('valid');
		expect(row2Mid.status).toBe('valid');
		if (row1Mid.status === 'valid') {
			expect(row1Mid.row.title).toBe('Updated by User 1');
			expect(row1Mid.row.views).toBe(0);
		}
		if (row2Mid.status === 'valid') {
			expect(row2Mid.row.title).toBe('Original');
			expect(row2Mid.row.views).toBe(100);
		}

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const row1After = tables1.posts.get('post-1');
		const row2After = tables2.posts.get('post-1');

		expect(row1After.status).toBe('valid');
		expect(row2After.status).toBe('valid');

		if (row1After.status === 'valid' && row2After.status === 'valid') {
			expect(row1After.row.title).toBe('Updated by User 1');
			expect(row1After.row.views).toBe(100);
			expect(row2After.row.title).toBe('Updated by User 1');
			expect(row2After.row.views).toBe(100);
		}
	});

	test('concurrent edits to same column use LWW', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const tables1 = createTables(doc1, {
			posts: { id: id(), title: text() },
		});
		const tables2 = createTables(doc2, {
			posts: { id: id(), title: text() },
		});

		tables1.posts.upsert({ id: 'post-1', title: 'Original' });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		tables1.posts.update({ id: 'post-1', title: 'User 1 Title' });
		tables2.posts.update({ id: 'post-1', title: 'User 2 Title' });

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const row1 = tables1.posts.get('post-1');
		const row2 = tables2.posts.get('post-1');

		expect(row1.status).toBe('valid');
		expect(row2.status).toBe('valid');
		if (row1.status === 'valid' && row2.status === 'valid') {
			expect(row1.row.title).toBe(row2.row.title);
		}
	});

	test('same-column conflicts: winner varies by client ID (demonstrates unpredictability)', () => {
		/**
		 * This test demonstrates that same-column concurrent edits have
		 * unpredictable winners based on Yjs's internal ordering.
		 *
		 * The winner depends on client IDs and CRDT merge order, NOT timestamps.
		 * This is acceptable because:
		 * 1. Cell-level CRDTs make same-column conflicts rare
		 * 2. Both clients always converge to the same value
		 *
		 * If predictable "last write wins" is needed, timestamps can be added.
		 */
		const winners: string[] = [];

		for (let i = 0; i < 10; i++) {
			const doc1 = new Y.Doc();
			const doc2 = new Y.Doc();

			const tables1 = createTables(doc1, {
				posts: { id: id(), title: text() },
			});
			const tables2 = createTables(doc2, {
				posts: { id: id(), title: text() },
			});

			tables1.posts.upsert({ id: 'post-1', title: 'Original' });
			Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

			tables1.posts.update({ id: 'post-1', title: `Iteration ${i} User 1` });
			tables2.posts.update({ id: 'post-1', title: `Iteration ${i} User 2` });

			Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
			Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

			const row1 = tables1.posts.get('post-1');
			const row2 = tables2.posts.get('post-1');

			expect(row1.status).toBe('valid');
			expect(row2.status).toBe('valid');

			if (row1.status === 'valid' && row2.status === 'valid') {
				expect(row1.row.title).toBe(row2.row.title);
				winners.push(row1.row.title.includes('User 1') ? 'User 1' : 'User 2');
			}
		}

		console.log('Same-column conflict winners:', winners);
	});

	test('partial updates preserve unmentioned fields', () => {
		const ydoc = new Y.Doc({ guid: 'test' });
		const tables = createTables(ydoc, {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		});

		tables.posts.upsert({
			id: 'post-1',
			title: 'Original Title',
			views: 50,
			published: true,
		});

		tables.posts.update({ id: 'post-1', title: 'New Title' });

		const result = tables.posts.get('post-1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.title).toBe('New Title');
			expect(result.row.views).toBe(50);
			expect(result.row.published).toBe(true);
		}
	});

	test('three-way merge: three docs editing different columns simultaneously', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		const doc3 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;
		doc3.clientID = 3;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);
		const tables3 = createTables(doc3, schema);

		// Initial state
		tables1.posts.upsert({
			id: 'post-1',
			title: 'Original',
			views: 0,
			published: false,
		});

		// Sync to all docs
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc3, Y.encodeStateAsUpdate(doc1));

		// Each doc edits a different column concurrently
		tables1.posts.update({ id: 'post-1', title: 'Title by User 1' });
		tables2.posts.update({ id: 'post-1', views: 100 });
		tables3.posts.update({ id: 'post-1', published: true });

		// Full sync: all docs exchange updates
		const update1 = Y.encodeStateAsUpdate(doc1);
		const update2 = Y.encodeStateAsUpdate(doc2);
		const update3 = Y.encodeStateAsUpdate(doc3);

		Y.applyUpdate(doc1, update2);
		Y.applyUpdate(doc1, update3);
		Y.applyUpdate(doc2, update1);
		Y.applyUpdate(doc2, update3);
		Y.applyUpdate(doc3, update1);
		Y.applyUpdate(doc3, update2);

		// All three docs should have all three changes
		for (const tables of [tables1, tables2, tables3]) {
			const result = tables.posts.get('post-1');
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.title).toBe('Title by User 1');
				expect(result.row.views).toBe(100);
				expect(result.row.published).toBe(true);
			}
		}
	});

	test('interleaved sync: partial syncs between edits', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Initial state
		tables1.posts.upsert({
			id: 'post-1',
			title: 'Original',
			views: 0,
			published: false,
		});
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// A edits title
		tables1.posts.update({ id: 'post-1', title: 'Edit 1 by A' });

		// Partial sync: A -> B only
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// B edits views (after receiving A's title change)
		tables2.posts.update({ id: 'post-1', views: 50 });

		// A edits title again (hasn't received B's views yet)
		tables1.posts.update({ id: 'post-1', title: 'Edit 2 by A' });

		// Full sync
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Both should have A's second title edit and B's views
		for (const tables of [tables1, tables2]) {
			const result = tables.posts.get('post-1');
			expect(result.status).toBe('valid');
			if (result.status === 'valid') {
				expect(result.row.title).toBe('Edit 2 by A');
				expect(result.row.views).toBe(50);
			}
		}
	});

	test('delete during concurrent edit: one doc deletes row while another edits it', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		tables1.posts.upsert({
			id: 'post-1',
			title: 'Original',
			views: 0,
		});
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		tables1.posts.delete('post-1');
		tables2.posts.update({ id: 'post-1', title: 'Updated Title' });

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const result1 = tables1.posts.get('post-1');
		const result2 = tables2.posts.get('post-1');

		// With Y.Map delete semantics, delete wins over concurrent updates
		// because the row's Y.Array is removed from the table Y.Map.
		// Doc2's update modified cells within the Y.Array, but doc1's
		// delete removed the entire Y.Array from the table Y.Map.
		// After sync, both see the row as deleted.
		expect(result1.status).toBe('not_found');
		expect(result2.status).toBe('not_found');
	});

	test('upsert vs update race: one doc upserts new row while another tries to update same ID', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// No initial sync - docs start empty

		// Doc1 upserts a new row
		tables1.posts.upsert({
			id: 'post-1',
			title: 'Created by Doc1',
			views: 10,
		});

		// Doc2 tries to update a row with same ID (doesn't exist locally)
		const updateResult = tables2.posts.update({
			id: 'post-1',
			title: 'Updated by Doc2',
		});

		// Update should be a no-op since row doesn't exist locally
		expect(updateResult.status).toBe('not_found_locally');

		// Doc2 row should still not exist
		expect(tables2.posts.get('post-1').status).toBe('not_found');

		// After sync, doc2 should see doc1's row
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		const result = tables2.posts.get('post-1');
		expect(result.status).toBe('valid');
		if (result.status === 'valid') {
			expect(result.row.title).toBe('Created by Doc1');
			expect(result.row.views).toBe(10);
		}
	});

	test('multiple rows concurrent: edits to different rows should be independent', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Create two rows
		tables1.posts.upsert({ id: 'post-1', title: 'Post 1', views: 0 });
		tables1.posts.upsert({ id: 'post-2', title: 'Post 2', views: 0 });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Doc1 edits post-1, doc2 edits post-2
		tables1.posts.update({ id: 'post-1', title: 'Post 1 Edited' });
		tables2.posts.update({ id: 'post-2', title: 'Post 2 Edited' });

		// Sync
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		// Both rows should have their respective edits
		for (const tables of [tables1, tables2]) {
			const result1 = tables.posts.get('post-1');
			const result2 = tables.posts.get('post-2');

			expect(result1.status).toBe('valid');
			expect(result2.status).toBe('valid');

			if (result1.status === 'valid' && result2.status === 'valid') {
				expect(result1.row.title).toBe('Post 1 Edited');
				expect(result2.row.title).toBe('Post 2 Edited');
			}
		}
	});

	test('observer fires correctly during sync: add events', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Set up observer on doc2 BEFORE any sync
		const addedIds: string[] = [];
		tables2.posts.observeChanges((changes) => {
			for (const [id, change] of changes) {
				if (change.action === 'add') {
					addedIds.push(id);
				}
			}
		});

		// Create row on doc1
		tables1.posts.upsert({ id: 'post-1', title: 'Created on Doc1' });

		// Sync to doc2 - observer should fire 'add'
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(addedIds).toContain('post-1');
	});

	test('observer fires correctly during sync: update events', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Create row and sync
		tables1.posts.upsert({ id: 'post-1', title: 'Original', views: 0 });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Set up observer on doc2
		const updatedIds: string[] = [];
		tables2.posts.observeChanges((changes) => {
			for (const [id, change] of changes) {
				if (change.action === 'update') {
					updatedIds.push(id);
				}
			}
		});

		// Update on doc1
		tables1.posts.update({ id: 'post-1', title: 'Modified' });

		// Sync to doc2 - observer should fire 'update'
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(updatedIds).toContain('post-1');
	});

	test('observer fires correctly during sync: delete events', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Create row and sync
		tables1.posts.upsert({ id: 'post-1', title: 'To be deleted' });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Set up observer on doc2
		const deletedIds: string[] = [];
		tables2.posts.observeChanges((changes) => {
			for (const [id, change] of changes) {
				if (change.action === 'delete') {
					deletedIds.push(id);
				}
			}
		});

		// Delete on doc1
		tables1.posts.delete('post-1');

		// Sync to doc2 - observer should fire 'delete'
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(deletedIds).toContain('post-1');
	});

	test('cache invalidation on sync: rowKVCache stays correct after receiving remote updates', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Create row on doc1 and sync
		tables1.posts.upsert({ id: 'post-1', title: 'Original', views: 0 });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Read on doc2 to populate cache
		const initialResult = tables2.posts.get('post-1');
		expect(initialResult.status).toBe('valid');
		if (initialResult.status === 'valid') {
			expect(initialResult.row.title).toBe('Original');
		}

		// Update on doc1
		tables1.posts.update({ id: 'post-1', title: 'Updated by Doc1' });

		// Sync to doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Read from doc2 cache - should see updated value
		const updatedResult = tables2.posts.get('post-1');
		expect(updatedResult.status).toBe('valid');
		if (updatedResult.status === 'valid') {
			expect(updatedResult.row.title).toBe('Updated by Doc1');
		}
	});

	test('concurrent upserts of same row create consistent result', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
				views: integer(),
				published: boolean(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		tables1.posts.upsert({
			id: 'post-1',
			title: 'Title from Doc1',
			views: 100,
			published: true,
		});
		tables2.posts.upsert({
			id: 'post-1',
			title: 'Title from Doc2',
			views: 200,
			published: false,
		});

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const result1 = tables1.posts.get('post-1');
		const result2 = tables2.posts.get('post-1');

		expect(result1.status).toBe('valid');
		expect(result2.status).toBe('valid');

		if (result1.status === 'valid' && result2.status === 'valid') {
			// When both docs independently create the same row ID, each doc creates
			// its own table Y.Map and row Y.Array. YJS LWW determines which table
			// wins. This is NOT cell-level merging since the rows were created
			// independently (not from a common ancestor). Both docs converge to
			// whichever row "wins" via YJS LWW (based on client ID tie-breaking).
			// The key guarantee is consistency: both docs see the same final state.
			expect(result1.row).toEqual(result2.row);
		}
	});

	test('getAll returns correct data after sync with remote additions', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Doc1 creates multiple rows
		tables1.posts.upsert({ id: 'post-1', title: 'First' });
		tables1.posts.upsert({ id: 'post-2', title: 'Second' });
		tables1.posts.upsert({ id: 'post-3', title: 'Third' });

		// Sync to doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// getAll on doc2 should return all 3 rows
		const allRows = tables2.posts.getAllValid();
		expect(allRows).toHaveLength(3);

		const titles = allRows.map((r) => r.title).sort();
		expect(titles).toEqual(['First', 'Second', 'Third']);
	});

	test('count stays correct after sync operations', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const schema = {
			posts: {
				id: id(),
				title: text(),
			},
		};

		const tables1 = createTables(doc1, schema);
		const tables2 = createTables(doc2, schema);

		// Doc1 creates rows
		tables1.posts.upsert({ id: 'post-1', title: 'One' });
		tables1.posts.upsert({ id: 'post-2', title: 'Two' });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(tables2.posts.count()).toBe(2);

		// Doc1 deletes one
		tables1.posts.delete('post-1');
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(tables2.posts.count()).toBe(1);

		// Doc1 adds more
		tables1.posts.upsert({ id: 'post-3', title: 'Three' });
		tables1.posts.upsert({ id: 'post-4', title: 'Four' });
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		expect(tables2.posts.count()).toBe(3);
	});
});
