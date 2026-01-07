/**
 * YKeyValue Conflict Resolution Tests
 *
 * These tests verify the conflict resolution behavior of YKeyValue,
 * particularly in offline sync scenarios where multiple clients
 * update the same key concurrently.
 *
 * Key finding: YKeyValue uses POSITIONAL conflict resolution (rightmost wins),
 * NOT timestamp-based. This means the "winner" depends on Yjs sync order,
 * which is unpredictable from the user's perspective.
 */
import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { YKeyValue } from './y-keyvalue';

describe('YKeyValue', () => {
	describe('Basic Operations', () => {
		test('set and get work correctly', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			kv.set('foo', 'bar');
			expect(kv.get('foo')).toBe('bar');
		});

		test('set overwrites existing value', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			kv.set('foo', 'first');
			kv.set('foo', 'second');
			expect(kv.get('foo')).toBe('second');
		});

		test('delete removes value', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			kv.set('foo', 'bar');
			kv.delete('foo');
			expect(kv.get('foo')).toBeUndefined();
			expect(kv.has('foo')).toBe(false);
		});

		test('has returns correct boolean', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			expect(kv.has('foo')).toBe(false);
			kv.set('foo', 'bar');
			expect(kv.has('foo')).toBe(true);
		});
	});

	describe('Change Events', () => {
		test('fires add event when new key is set', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			const events: Array<{ key: string; action: string }> = [];
			kv.on('change', (changes) => {
				for (const [key, change] of changes) {
					events.push({ key, action: change.action });
				}
			});

			kv.set('foo', 'bar');
			expect(events).toEqual([{ key: 'foo', action: 'add' }]);
		});

		test('fires update event when existing key is changed', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			kv.set('foo', 'first');

			const events: Array<{
				key: string;
				action: string;
				oldValue?: string;
				newValue?: string;
			}> = [];
			kv.on('change', (changes) => {
				for (const [key, change] of changes) {
					events.push({
						key,
						action: change.action,
						oldValue: 'oldValue' in change ? change.oldValue : undefined,
						newValue: 'newValue' in change ? change.newValue : undefined,
					});
				}
			});

			kv.set('foo', 'second');
			expect(events).toEqual([
				{ key: 'foo', action: 'update', oldValue: 'first', newValue: 'second' },
			]);
		});

		test('fires delete event when key is removed', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

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

	describe('Sync Behavior - Two Document Simulation', () => {
		/**
		 * Simulates two clients editing the same key while offline,
		 * then syncing their changes.
		 *
		 * This test demonstrates that YKeyValue uses POSITIONAL conflict
		 * resolution - the winner depends on sync order, not timestamps.
		 */
		test('concurrent updates: winner is determined by sync order, not time', () => {
			// Create two separate Y.Docs (simulating two offline clients)
			const doc1 = new Y.Doc({ guid: 'shared' });
			const doc2 = new Y.Doc({ guid: 'shared' });

			const array1 = doc1.getArray<{ key: string; val: string }>('data');
			const array2 = doc2.getArray<{ key: string; val: string }>('data');

			const kv1 = new YKeyValue(array1);
			const kv2 = new YKeyValue(array2);

			// Client 1 sets value (imagine this is at 10:00am)
			kv1.set('doc', 'from-client-1');

			// Client 2 sets value (imagine this is at 10:05am - LATER)
			kv2.set('doc', 'from-client-2');

			// Now sync: Apply doc1's changes to doc2, then doc2's changes to doc1
			const state1 = Y.encodeStateAsUpdate(doc1);
			const state2 = Y.encodeStateAsUpdate(doc2);

			// Apply in order: doc1 → doc2, doc2 → doc1
			Y.applyUpdate(doc2, state1);
			Y.applyUpdate(doc1, state2);

			// Both docs should now have the same value
			// But WHICH value? It depends on the CRDT merge order.
			const value1 = kv1.get('doc');
			const value2 = kv2.get('doc');

			// Both clients should see the same value (convergence)
			expect(value1).toBe(value2);

			// The key insight: we can't predict WHICH value wins.
			// It could be 'from-client-1' or 'from-client-2' depending on
			// how Yjs merges the concurrent array pushes.
			console.log(`Winner: ${value1}`);
		});

		test('concurrent updates converge to same value across all clients', () => {
			// Run the sync test multiple times to observe if outcome varies
			const results: string[] = [];

			for (let i = 0; i < 10; i++) {
				const doc1 = new Y.Doc({ guid: `shared-${i}` });
				const doc2 = new Y.Doc({ guid: `shared-${i}` });

				const array1 = doc1.getArray<{ key: string; val: string }>('data');
				const array2 = doc2.getArray<{ key: string; val: string }>('data');

				const kv1 = new YKeyValue(array1);
				const kv2 = new YKeyValue(array2);

				kv1.set('key', `value-from-1-iteration-${i}`);
				kv2.set('key', `value-from-2-iteration-${i}`);

				const state1 = Y.encodeStateAsUpdate(doc1);
				const state2 = Y.encodeStateAsUpdate(doc2);

				Y.applyUpdate(doc2, state1);
				Y.applyUpdate(doc1, state2);

				// Convergence check: both should have same value
				expect(kv1.get('key')).toBe(kv2.get('key'));

				results.push(kv1.get('key')!);
			}

			// Log results to observe pattern
			console.log('Concurrent update winners:', results);
		});

		test('delete vs update race condition', () => {
			// Client 1 deletes a key
			// Client 2 updates the same key
			// Who wins after sync?

			const doc1 = new Y.Doc({ guid: 'shared-delete-test' });
			const doc2 = new Y.Doc({ guid: 'shared-delete-test' });

			const array1 = doc1.getArray<{ key: string; val: string }>('data');
			const array2 = doc2.getArray<{ key: string; val: string }>('data');

			// First, establish initial state in both docs
			const kv1 = new YKeyValue(array1);
			kv1.set('doc', 'initial');

			// Sync initial state to doc2
			Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));
			const kv2 = new YKeyValue(array2);

			expect(kv2.get('doc')).toBe('initial');

			// Now, while offline:
			// Client 1 DELETES the key
			kv1.delete('doc');

			// Client 2 UPDATES the key (doesn't know about the delete)
			kv2.set('doc', 'updated-value');

			// Sync both ways
			const state1 = Y.encodeStateAsUpdate(doc1);
			const state2 = Y.encodeStateAsUpdate(doc2);

			Y.applyUpdate(doc2, state1);
			Y.applyUpdate(doc1, state2);

			// What's the result?
			const value1 = kv1.get('doc');
			const value2 = kv2.get('doc');

			// Both should converge
			expect(value1).toBe(value2);

			// Log the outcome - this is unpredictable!
			console.log(`Delete vs Update result: ${value1 ?? 'DELETED'}`);
		});
	});

	describe('Array Cleanup Behavior', () => {
		test('duplicate keys are cleaned up on construction', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');

			// Manually push duplicate keys (simulating sync artifacts)
			yarray.push([{ key: 'foo', val: 'first' }]);
			yarray.push([{ key: 'bar', val: 'only' }]);
			yarray.push([{ key: 'foo', val: 'second' }]); // duplicate

			expect(yarray.length).toBe(3);

			// Creating YKeyValue should clean up duplicates
			const kv = new YKeyValue(yarray);

			// Rightmost 'foo' should win
			expect(kv.get('foo')).toBe('second');
			expect(kv.get('bar')).toBe('only');

			// Array should be cleaned (duplicates removed)
			expect(yarray.length).toBe(2);
		});

		test('rightmost entry wins during cleanup', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');

			// Push same key multiple times
			yarray.push([{ key: 'x', val: 'A' }]);
			yarray.push([{ key: 'x', val: 'B' }]);
			yarray.push([{ key: 'x', val: 'C' }]);

			const kv = new YKeyValue(yarray);

			// Rightmost ('C') should win
			expect(kv.get('x')).toBe('C');
			expect(yarray.length).toBe(1);
		});
	});

	describe('Storage Efficiency', () => {
		test('maintains constant size regardless of update count', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: number }>('data');
			const kv = new YKeyValue(yarray);

			for (let i = 0; i < 100; i++) {
				kv.set('counter', i);
			}

			expect(yarray.length).toBe(1);
			expect(kv.get('counter')).toBe(99);
		});

		test('size scales with unique keys, not operations', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			for (let i = 0; i < 10; i++) {
				kv.set(`key-${i}`, `value-${i}`);
			}

			for (let round = 0; round < 10; round++) {
				for (let i = 0; i < 10; i++) {
					kv.set(`key-${i}`, `value-${i}-round-${round}`);
				}
			}

			expect(yarray.length).toBe(10);
		});
	});

	describe('Documentation of Conflict Resolution Behavior', () => {
		/**
		 * This test documents the EXACT conflict resolution mechanism.
		 *
		 * YKeyValue uses "rightmost wins" - when the cleanup logic runs
		 * (either on construction or via observer), it iterates right-to-left
		 * and keeps only the first occurrence of each key.
		 *
		 * This is DETERMINISTIC given a specific array state, but the array
		 * state after CRDT merge depends on Yjs's internal ordering algorithm
		 * for concurrent inserts, which considers client IDs and vector clocks.
		 */
		test('conflict resolution is positional (rightmost wins)', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');

			// Manually construct a conflicted state
			yarray.push([{ key: 'x', val: 'leftmost' }]);
			yarray.push([{ key: 'y', val: 'middle-y' }]);
			yarray.push([{ key: 'x', val: 'rightmost' }]); // This should win

			const kv = new YKeyValue(yarray);

			expect(kv.get('x')).toBe('rightmost');
			expect(kv.get('y')).toBe('middle-y');
		});

		/**
		 * This test shows that there are NO TIMESTAMPS in the current implementation.
		 * The entry structure is just { key, val } - no temporal information.
		 */
		test('entries have no timestamp field', () => {
			const ydoc = new Y.Doc({ guid: 'test' });
			const yarray = ydoc.getArray<{ key: string; val: string }>('data');
			const kv = new YKeyValue(yarray);

			kv.set('foo', 'bar');

			// Inspect the raw array entry
			const entry = yarray.get(0);
			expect(entry).toEqual({ key: 'foo', val: 'bar' });

			// No timestamp field exists
			expect('timestamp' in entry).toBe(false);
			expect('time' in entry).toBe(false);
			expect('updatedAt' in entry).toBe(false);
		});
	});
});
