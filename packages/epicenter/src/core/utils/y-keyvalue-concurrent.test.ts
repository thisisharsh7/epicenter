/**
 * Test to verify concurrent update behavior in YKeyValue.
 *
 * Question: If two users edit different properties of the same row,
 * do both changes merge, or does one overwrite the other?
 */
import { describe, test, expect } from 'bun:test';
import * as Y from 'yjs';
import { YKeyValue } from './y-keyvalue';

type Row = { id: string; title: string; views: number };

describe('YKeyValue concurrent updates', () => {
	test('two users editing different properties of same key - does it merge?', () => {
		// Setup: Two Y.Docs that will sync
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const arr1 = doc1.getArray<{ key: string; val: Row }>('data');
		const arr2 = doc2.getArray<{ key: string; val: Row }>('data');

		const kv1 = new YKeyValue(arr1);
		const kv2 = new YKeyValue(arr2);

		// Initial state: both have the same row
		kv1.set('row-1', { id: 'row-1', title: 'Original', views: 0 });

		// Sync doc1 → doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// Verify both see the same initial state
		expect(kv1.get('row-1')).toEqual({
			id: 'row-1',
			title: 'Original',
			views: 0,
		});
		expect(kv2.get('row-1')).toEqual({
			id: 'row-1',
			title: 'Original',
			views: 0,
		});

		// CONCURRENT EDITS (before sync)
		// User 1 updates title
		const row1 = kv1.get('row-1')!;
		kv1.set('row-1', { ...row1, title: 'Updated by User 1' });

		// User 2 updates views (using their local copy, which still has original title)
		const row2 = kv2.get('row-1')!;
		kv2.set('row-1', { ...row2, views: 100 });

		// Before sync - each sees their own changes
		expect(kv1.get('row-1')).toEqual({
			id: 'row-1',
			title: 'Updated by User 1',
			views: 0,
		});
		expect(kv2.get('row-1')).toEqual({
			id: 'row-1',
			title: 'Original',
			views: 100,
		});

		// SYNC both ways
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		// After sync - what do we get?
		const final1 = kv1.get('row-1');
		const final2 = kv2.get('row-1');

		console.log('After sync:');
		console.log('  kv1 sees:', final1);
		console.log('  kv2 sees:', final2);

		// Both should see the same thing (consistency)
		expect(final1).toEqual(final2);

		// THE BIG QUESTION: Did both changes merge?
		// If YKeyValue supports column-level merging, we'd expect:
		//   { id: 'row-1', title: 'Updated by User 1', views: 100 }
		//
		// If it's last-writer-wins at the row level, we'd expect ONE of:
		//   { id: 'row-1', title: 'Updated by User 1', views: 0 }  (User 1 wins)
		//   { id: 'row-1', title: 'Original', views: 100 }         (User 2 wins)

		const bothMerged =
			final1?.title === 'Updated by User 1' && final1?.views === 100;
		const user1Wins =
			final1?.title === 'Updated by User 1' && final1?.views === 0;
		const user2Wins = final1?.title === 'Original' && final1?.views === 100;

		console.log('\nResult:');
		console.log('  Both changes merged?', bothMerged);
		console.log('  User 1 wins (title)?', user1Wins);
		console.log('  User 2 wins (views)?', user2Wins);

		// This test documents the ACTUAL behavior
		// Uncomment the assertion that matches reality:

		if (bothMerged) {
			console.log('\n✅ GOOD NEWS: YKeyValue DOES merge at property level!');
		} else {
			console.log('\n⚠️  CONFIRMED: YKeyValue is last-writer-wins at ROW level');
			console.log("   One user's changes were lost!");
		}
	});

	test('what if we use nested Y.Map for the row value?', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		const table1 = doc1.getMap<Y.Map<unknown>>('table');
		const table2 = doc2.getMap<Y.Map<unknown>>('table');

		const row1 = new Y.Map<unknown>();
		row1.set('id', 'row-1');
		row1.set('title', 'Original');
		row1.set('views', 0);
		table1.set('row-1', row1);

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		const t1Row = table1.get('row-1')!;
		const t2Row = table2.get('row-1')!;
		expect(t1Row.get('title')).toBe('Original');
		expect(t2Row.get('title')).toBe('Original');

		t1Row.set('title', 'Updated by User 1');
		t2Row.set('views', 100);

		expect(t1Row.get('title')).toBe('Updated by User 1');
		expect(t1Row.get('views')).toBe(0);
		expect(t2Row.get('title')).toBe('Original');
		expect(t2Row.get('views')).toBe(100);

		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const final1 = { title: t1Row.get('title'), views: t1Row.get('views') };
		const final2 = { title: t2Row.get('title'), views: t2Row.get('views') };

		console.log('\nY.Map (row = Y.Map) - After sync:');
		console.log('  doc1 sees:', final1);
		console.log('  doc2 sees:', final2);

		expect(final1.title).toBe('Updated by User 1');
		expect(final1.views).toBe(100);
		expect(final2.title).toBe('Updated by User 1');
		expect(final2.views).toBe(100);

		console.log('✅ Y.Map DOES merge at property level!');
	});

	test('YOUR PROPOSAL: table=Y.Map, row=YKeyValue (cell-level merging)', () => {
		const doc1 = new Y.Doc();
		const doc2 = new Y.Doc();
		doc1.clientID = 1;
		doc2.clientID = 2;

		// Table is Y.Map<rowId, Y.Array> where Y.Array backs a YKeyValue per row
		const table1 = doc1.getMap<Y.Array<{ key: string; val: unknown }>>('table');
		const table2 = doc2.getMap<Y.Array<{ key: string; val: unknown }>>('table');

		// Create row-1 as a YKeyValue (Y.Array of {key: columnName, val: cellValue})
		const row1Array = new Y.Array<{ key: string; val: unknown }>();
		table1.set('row-1', row1Array);

		// Wrap with YKeyValue for nice API
		const row1KV = new YKeyValue(row1Array);
		row1KV.set('id', 'row-1');
		row1KV.set('title', 'Original');
		row1KV.set('views', 0);

		// Sync to doc2
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

		// doc2 wraps its copy
		const row2Array = table2.get('row-1')!;
		const row2KV = new YKeyValue(row2Array);

		expect(row1KV.get('title')).toBe('Original');
		expect(row2KV.get('title')).toBe('Original');

		// CONCURRENT EDITS to DIFFERENT columns
		row1KV.set('title', 'Updated by User 1');
		row2KV.set('views', 100);

		// Before sync
		expect(row1KV.get('title')).toBe('Updated by User 1');
		expect(row1KV.get('views')).toBe(0);
		expect(row2KV.get('title')).toBe('Original');
		expect(row2KV.get('views')).toBe(100);

		// Sync both ways
		Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
		Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

		const final1 = { title: row1KV.get('title'), views: row1KV.get('views') };
		const final2 = { title: row2KV.get('title'), views: row2KV.get('views') };

		console.log('\nYOUR PROPOSAL (table=Y.Map, row=YKeyValue) - After sync:');
		console.log('  doc1 sees:', final1);
		console.log('  doc2 sees:', final2);

		const bothMerged =
			final1.title === 'Updated by User 1' && final1.views === 100;

		if (bothMerged) {
			console.log('✅ CELL-LEVEL MERGING WORKS! Both changes preserved!');
		} else {
			console.log('❌ Still row-level LWW, one change lost');
		}

		expect(final1).toEqual(final2);
	});
});
