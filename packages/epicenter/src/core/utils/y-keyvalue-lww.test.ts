/**
 * YKeyValueLww Tests - Last-Write-Wins Conflict Resolution
 *
 * These tests verify that YKeyValueLww correctly implements timestamp-based
 * conflict resolution, where higher timestamps always win regardless of sync order.
 *
 * See also:
 * - `y-keyvalue.ts` for positional (rightmost-wins) alternative
 * - `y-keyvalue-comparison.test.ts` for side-by-side behavioral comparison
 */
import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { YKeyValueLww, type YKeyValueLwwEntry } from './y-keyvalue-lww';

describe('YKeyValueLww', () => {
	describe('Basic Operations', () => {
		test('set and get work correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'bar');
			expect(kv.get('foo')).toBe('bar');
		});

		test('set overwrites existing value', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'first');
			kv.set('foo', 'second');
			expect(kv.get('foo')).toBe('second');
		});

		test('delete removes value', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'bar');
			kv.delete('foo');
			expect(kv.get('foo')).toBeUndefined();
			expect(kv.has('foo')).toBe(false);
		});

		test('entries have timestamp field', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'bar');

			const entry = yarray.get(0);
			expect(entry.key).toBe('foo');
			expect(entry.val).toBe('bar');
			expect(typeof entry.ts).toBe('number');
			expect(entry.ts).toBeGreaterThan(0);
		});

		test('timestamps are monotonically increasing', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('a', '1');
			kv.set('b', '2');
			kv.set('c', '3');

			const entries = yarray.toArray();
			expect(entries[0]!.ts).toBeLessThan(entries[1]!.ts);
			expect(entries[1]!.ts).toBeLessThan(entries[2]!.ts);
		});
	});

	describe('LWW Conflict Resolution', () => {
		test('higher timestamp wins regardless of sync order', () => {
			// Create two docs that will sync
			const doc1 = new Y.Doc({ guid: 'shared' });
			const doc2 = new Y.Doc({ guid: 'shared' });

			const array1 = doc1.getArray<YKeyValueLwwEntry<string>>('data');
			const array2 = doc2.getArray<YKeyValueLwwEntry<string>>('data');

			// Manually push entries with controlled timestamps
			// Client 1 writes with LOWER timestamp (earlier)
			array1.push([{ key: 'x', val: 'from-client-1-earlier', ts: 1000 }]);

			// Client 2 writes with HIGHER timestamp (later)
			array2.push([{ key: 'x', val: 'from-client-2-later', ts: 2000 }]);

			// Sync in both directions
			Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
			Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

			// Now create KV wrappers - they should resolve conflicts
			const kv1 = new YKeyValueLww(array1);
			const kv2 = new YKeyValueLww(array2);

			// Higher timestamp should win
			expect(kv1.get('x')).toBe('from-client-2-later');
			expect(kv2.get('x')).toBe('from-client-2-later');
		});

		test('later edit wins over earlier edit (LWW semantics)', () => {
			const doc1 = new Y.Doc({ guid: 'shared' });
			const doc2 = new Y.Doc({ guid: 'shared' });

			const array1 = doc1.getArray<YKeyValueLwwEntry<string>>('data');
			const array2 = doc2.getArray<YKeyValueLwwEntry<string>>('data');

			// Manually push entries with CONTROLLED timestamps to test LWW
			// Client 1 writes with LOWER timestamp (earlier edit)
			array1.push([{ key: 'doc', val: 'edit-from-client-1', ts: 1000 }]);

			// Client 2 writes with HIGHER timestamp (later edit)
			array2.push([{ key: 'doc', val: 'edit-from-client-2', ts: 2000 }]);

			// Sync both directions
			Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
			Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

			// Create KV wrappers - they should resolve conflicts using timestamps
			const kv1 = new YKeyValueLww(array1);
			const kv2 = new YKeyValueLww(array2);

			// Higher timestamp (2000) should win
			expect(kv1.get('doc')).toBe('edit-from-client-2');
			expect(kv2.get('doc')).toBe('edit-from-client-2');
		});

		test('convergence: both clients see same value after sync', () => {
			const results: { value: string; ts1: number; ts2: number }[] = [];

			for (let i = 0; i < 10; i++) {
				const doc1 = new Y.Doc({ guid: `shared-${i}` });
				const doc2 = new Y.Doc({ guid: `shared-${i}` });

				const array1 = doc1.getArray<YKeyValueLwwEntry<string>>('data');
				const array2 = doc2.getArray<YKeyValueLwwEntry<string>>('data');

				// Manually insert with controlled timestamps to test ordering
				const ts1 = 1000 + Math.random() * 1000;
				const ts2 = 1000 + Math.random() * 1000;

				array1.push([{ key: 'key', val: `client-1-${i}`, ts: ts1 }]);
				array2.push([{ key: 'key', val: `client-2-${i}`, ts: ts2 }]);

				// Sync
				Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
				Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2));

				// Create KV wrappers
				const kv1 = new YKeyValueLww(array1);
				const kv2 = new YKeyValueLww(array2);

				// Must converge
				expect(kv1.get('key')).toBe(kv2.get('key'));

				// Higher timestamp should win
				const expectedWinner = ts1 > ts2 ? `client-1-${i}` : `client-2-${i}`;
				expect(kv1.get('key')).toBe(expectedWinner);

				results.push({ value: kv1.get('key')!, ts1, ts2 });
			}

			console.log('LWW convergence results:', results);
		});
	});

	describe('Change Events', () => {
		test('fires add event for new key', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			const events: Array<{ key: string; action: string }> = [];
			kv.on('change', (changes) => {
				for (const [key, change] of changes) {
					events.push({ key, action: change.action });
				}
			});

			kv.set('foo', 'bar');
			expect(events).toEqual([{ key: 'foo', action: 'add' }]);
		});

		test('fires update event when value changes', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'first');

			const events: Array<{ key: string; action: string }> = [];
			kv.on('change', (changes) => {
				for (const [key, change] of changes) {
					events.push({ key, action: change.action });
				}
			});

			kv.set('foo', 'second');
			expect(events).toEqual([{ key: 'foo', action: 'update' }]);
		});

		test('fires delete event when key removed', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');
			const kv = new YKeyValueLww(yarray);

			kv.set('foo', 'bar');

			const events: Array<{ key: string; action: string }> = [];
			kv.on('change', (changes) => {
				for (const [key, change] of changes) {
					events.push({ key, action: change.action });
				}
			});

			kv.delete('foo');
			expect(events).toEqual([{ key: 'foo', action: 'delete' }]);
		});
	});

	describe('Equal Timestamp Tiebreaker', () => {
		test('equal timestamps fall back to positional ordering (rightmost wins)', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<YKeyValueLwwEntry<string>>('data');

			// Push two entries with same timestamp
			yarray.push([{ key: 'x', val: 'first', ts: 1000 }]);
			yarray.push([{ key: 'x', val: 'second', ts: 1000 }]); // same ts, but rightmost

			const kv = new YKeyValueLww(yarray);

			// Rightmost should win when timestamps equal
			expect(kv.get('x')).toBe('second');
			expect(yarray.length).toBe(1); // Duplicate should be cleaned up
		});
	});
});
