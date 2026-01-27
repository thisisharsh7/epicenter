/**
 * # YKeyValue - Efficient Key-Value Store for Yjs
 *
 * Based on [y-utility](https://github.com/yjs/y-utility) (MIT License).
 *
 * **See also**: `y-keyvalue-lww.ts` for timestamp-based last-write-wins conflict resolution,
 * which is better suited for offline-first, multi-device scenarios where "latest edit wins"
 * semantics are desired.
 *
 * ## The Problem: Y.Map's Unbounded Growth
 *
 * Yjs is a CRDT (Conflict-free Replicated Data Type) library that enables real-time
 * collaboration. CRDTs solve a hard problem: when two users edit the same data
 * simultaneously without coordination, how do you merge their changes?
 *
 * Y.Map solves this by keeping historical context. When you update a key, Yjs doesn't
 * just overwrite the old value—it needs to remember what was there so it can merge
 * correctly when syncing with other clients.
 *
 * **The catch**: Y.Map retains ALL historical values for EACH key. If you update
 * `key1` 1000 times, Y.Map stores all 1000 values internally. For a key-value store
 * pattern (like storing table rows), this causes unbounded memory growth:
 *
 * ```
 * // Alternating updates cause worst-case growth:
 * map.set('row1', data1)  // 1 item stored
 * map.set('row2', data2)  // 2 items stored
 * map.set('row1', data3)  // 3 items stored (old row1 value retained!)
 * map.set('row2', data4)  // 4 items stored (old row2 value retained!)
 * // ... after 100k operations on 10 keys: 524,985 bytes
 * ```
 *
 * ## The Solution: Append-and-Cleanup with Y.Array
 *
 * YKeyValue uses Y.Array instead of Y.Map with a clever strategy:
 *
 * 1. **Append new entries to the right**: When you set a key, push `{key, val}` to
 *    the end of the array
 * 2. **Remove old duplicates**: Delete any previous entry with the same key
 * 3. **Right-side precedence**: If two clients add the same key simultaneously,
 *    the rightmost entry wins (this is the CRDT merge rule)
 *
 * ```
 * // Same operations, constant size:
 * array: [{key:'row1', val:data1}]                           // 1 item
 * array: [{key:'row1', val:data1}, {key:'row2', val:data2}]  // 2 items
 * array: [{key:'row2', val:data2}, {key:'row1', val:data3}]  // still 2 items!
 * // ... after 100k operations on 10 keys: 271 bytes
 * ```
 *
 * **Why Y.Array doesn't have the same problem**: When you delete from Y.Array,
 * Yjs marks the item as a "tombstone" but doesn't retain the full value—just
 * enough metadata to know it was deleted. The actual data is garbage collected.
 *
 * ## How the In-Memory Map Works
 *
 * Scanning an array for a key is O(n). To get O(1) lookups, YKeyValue maintains
 * an in-memory `Map<string, {key, val}>` that mirrors the Y.Array:
 *
 * ```
 * Y.Array (source of truth, synced across clients):
 *   [{key:'a', val:1}, {key:'b', val:2}, {key:'c', val:3}]
 *
 * In-memory Map (local cache for fast lookups):
 *   'a' → {key:'a', val:1}
 *   'b' → {key:'b', val:2}
 *   'c' → {key:'c', val:3}
 * ```
 *
 * The Map is rebuilt on initialization and updated incrementally via Y.Array's
 * observer. It's never persisted—just derived state.
 *
 * ## Conflict Resolution: ClientID-Based Ordering
 *
 * When two clients simultaneously set the same key, both entries end up in the
 * array. The final order depends on Yjs's CRDT merge algorithm, which uses
 * **clientID ordering** (lower clientID wins ties). This is the SAME ordering
 * mechanism that Y.Map uses internally.
 *
 * ```
 * Client A (clientID: 100): array.push({key:'x', val:'A'})
 * Client B (clientID: 200): array.push({key:'x', val:'B'})
 *
 * After sync, array is deterministically ordered based on clientIDs.
 * YKeyValue's cleanup keeps only the rightmost 'x'.
 * ```
 *
 * The key insight: YKeyValue's "rightmost wins" cleanup on top of Yjs's
 * clientID-ordered array produces deterministic conflict resolution—the same
 * mechanism that powers Y.Map.
 *
 * ## Performance
 *
 * Benchmark (100k operations on 10 keys):
 * - **YKeyValue**: 271 bytes (constant, ~27 bytes per key)
 * - **Y.Map**: 524,985 bytes (grows with operation count)
 * - **Improvement**: 1935x smaller
 *
 * Time complexity:
 * - `get()`: O(1) via in-memory Map
 * - `set()`: O(n) worst case (scan to find old entry), typically O(1) amortized
 * - `delete()`: O(n) worst case (scan to find entry)
 * - Iteration: O(n)
 *
 * ## Limitations
 *
 * - **No nested Yjs types**: Values must be JSON-serializable (no Y.Text, Y.Map, etc.)
 * - **No partial updates**: Setting a key replaces the entire value
 * - **Order not preserved**: Iteration order depends on insertion/update history
 *
 * For collaborative text editing within a value, store the text in a separate
 * Y.Text and reference it by ID.
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs';
 * import { YKeyValue } from './y-keyvalue';
 *
 * const doc = new Y.Doc();
 * const yarray = doc.getArray<{ key: string; val: { name: string; age: number } }>('users');
 * const kv = new YKeyValue(yarray);
 *
 * // Basic operations
 * kv.set('user1', { name: 'Alice', age: 30 });
 * kv.set('user2', { name: 'Bob', age: 25 });
 *
 * console.log(kv.get('user1')); // { name: 'Alice', age: 30 }
 * console.log(kv.has('user2')); // true
 *
 * // Update (replaces entire value)
 * kv.set('user1', { name: 'Alice', age: 31 });
 *
 * // Delete
 * kv.delete('user2');
 *
 * // Observe changes
 * kv.on('change', (changes, transaction) => {
 *   for (const [key, change] of changes) {
 *     if (change.action === 'add') {
 *       console.log(`Added ${key}:`, change.newValue);
 *     } else if (change.action === 'update') {
 *       console.log(`Updated ${key}:`, change.oldValue, '→', change.newValue);
 *     } else if (change.action === 'delete') {
 *       console.log(`Deleted ${key}:`, change.oldValue);
 *     }
 *   }
 * });
 * ```
 */
import type * as Y from 'yjs';

/**
 * Entry stored in the Y.Array.
 *
 * Field names are intentionally short (`val` not `value`) to minimize
 * serialized storage size - these entries are persisted and synced.
 */
export type YKeyValueEntry<T> = { key: string; val: T };

export type YKeyValueChange<T> =
	| { action: 'add'; newValue: T }
	| { action: 'update'; oldValue: T; newValue: T }
	| { action: 'delete'; oldValue: T };

export type YKeyValueChangeHandler<T> = (
	changes: Map<string, YKeyValueChange<T>>,
	transaction: Y.Transaction,
) => void;

export class YKeyValue<T> {
	/** The underlying Y.Array that stores `{key, val}` entries. This is the CRDT source of truth. */
	readonly yarray: Y.Array<YKeyValueEntry<T>>;

	/** The Y.Doc that owns this array. Required for transactions. */
	readonly doc: Y.Doc;

	/**
	 * In-memory index for O(1) key lookups. Maps key → entry object.
	 *
	 * This is derived state rebuilt from yarray on init. It stores references to
	 * the actual entry objects in yarray, so `map.get(key) === yarray.get(i)` for
	 * the corresponding index.
	 */
	readonly map: Map<string, YKeyValueEntry<T>>;

	/**
	 * Registered change handlers for the `.on('change', handler)` API.
	 *
	 * ## Why not use Y.Array.observe() directly?
	 *
	 * YKeyValue is a meta data structure: it wraps Y.Array but presents a map-like
	 * interface. The raw Y.Array events don't map cleanly to "key-value" semantics:
	 *
	 * - Y.Array fires on positional changes (insert at index 5, delete range 2-4)
	 * - YKeyValue needs semantic changes (key 'foo' was added/updated/deleted)
	 *
	 * We already observe Y.Array internally to maintain `this.map`. This handler set
	 * lets us expose higher-level change events that make sense for key-value usage:
	 *
	 * ```typescript
	 * // Raw Y.Array event (low-level, positional):
	 * yarray.observe((event) => {
	 *   // event.changes.added: Set<Item> - items added at various positions
	 *   // event.changes.deleted: Set<Item> - items removed from various positions
	 * });
	 *
	 * // YKeyValue event (high-level, semantic):
	 * kv.on('change', (changes) => {
	 *   // changes: Map<key, { action: 'add'|'update'|'delete', oldValue?, newValue? }>
	 * });
	 * ```
	 *
	 * The internal observer translates positional changes to semantic changes,
	 * then dispatches to all registered handlers.
	 */
	private changeHandlers: Set<YKeyValueChangeHandler<T>> = new Set();

	/**
	 * Create a YKeyValue wrapper around an existing Y.Array.
	 *
	 * On construction:
	 * 1. Scans the array right-to-left to build the in-memory Map
	 * 2. Removes any duplicate keys (keeps rightmost, per CRDT rules)
	 * 3. Sets up an observer to keep the Map in sync with future changes
	 *
	 * @param yarray - A Y.Array storing `{key: string, val: T}` entries
	 */
	constructor(yarray: Y.Array<YKeyValueEntry<T>>) {
		this.yarray = yarray;
		this.doc = yarray.doc as Y.Doc;
		this.map = new Map();

		const entries = yarray.toArray();
		this.doc.transact(() => {
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i]!;
				if (this.map.has(entry.key)) {
					yarray.delete(i);
				} else {
					this.map.set(entry.key, entry);
				}
			}
		});

		yarray.observe((event, transaction) => {
			const changes = new Map<string, YKeyValueChange<T>>();
			const addedItems: Y.Item[] = Array.from(event.changes.added);

			event.changes.deleted.forEach((deletedItem) => {
				deletedItem.content.getContent().forEach((entry: YKeyValueEntry<T>) => {
					// Reference equality: only process if this is the entry we have cached
					// (Yjs returns the same object reference from the array)
					if (this.map.get(entry.key) === entry) {
						this.map.delete(entry.key);
						changes.set(entry.key, { action: 'delete', oldValue: entry.val });
					}
				});
			});

			const addedEntriesByKey = new Map<string, YKeyValueEntry<T>>();
			addedItems
				.flatMap((item) => item.content.getContent())
				.forEach((entry: YKeyValueEntry<T>) => {
					addedEntriesByKey.set(entry.key, entry);
				});

			const keysToRemove = new Set<string>();
			const allEntries = yarray.toArray();

			this.doc.transact(() => {
				for (
					let i = allEntries.length - 1;
					i >= 0 && (addedEntriesByKey.size > 0 || keysToRemove.size > 0);
					i--
				) {
					const currentEntry = allEntries[i]!;

					if (keysToRemove.has(currentEntry.key)) {
						keysToRemove.delete(currentEntry.key);
						yarray.delete(i, 1);
					} else if (addedEntriesByKey.get(currentEntry.key) === currentEntry) {
						const previousEntry = this.map.get(currentEntry.key);
						if (previousEntry) {
							keysToRemove.add(currentEntry.key);
							changes.set(currentEntry.key, {
								action: 'update',
								oldValue: previousEntry.val,
								newValue: currentEntry.val,
							});
						} else {
							const deleteEvent = changes.get(currentEntry.key);
							if (deleteEvent && deleteEvent.action === 'delete') {
								changes.set(currentEntry.key, {
									action: 'update',
									newValue: currentEntry.val,
									oldValue: deleteEvent.oldValue,
								});
							} else {
								changes.set(currentEntry.key, {
									action: 'add',
									newValue: currentEntry.val,
								});
							}
						}
						addedEntriesByKey.delete(currentEntry.key);
						this.map.set(currentEntry.key, currentEntry);
					} else if (addedEntriesByKey.has(currentEntry.key)) {
						keysToRemove.add(currentEntry.key);
						addedEntriesByKey.delete(currentEntry.key);
					}
				}
			});

			if (changes.size > 0) {
				for (const handler of this.changeHandlers) {
					handler(changes, transaction);
				}
			}
		});
	}

	/**
	 * Set a key-value pair. Creates or replaces the entire value.
	 *
	 * Algorithm: Delete old entry (if exists) + append new entry to right.
	 * The in-memory Map is updated synchronously before the transaction
	 * commits, ensuring `get()` returns the new value immediately.
	 */
	set(key: string, val: T): void {
		const entry = { key, val };
		const existing = this.map.get(key);

		this.doc.transact(() => {
			if (existing) {
				let index = 0;
				for (const currentEntry of this.yarray) {
					if (currentEntry.key === key) {
						this.yarray.delete(index);
						break;
					}
					index++;
				}
			}
			this.yarray.push([entry]);
		});

		this.map.set(key, entry);
	}

	/** Delete a key. No-op if key doesn't exist. O(n) scan to find entry. */
	delete(key: string): void {
		if (!this.map.has(key)) return;

		let index = 0;
		for (const currentEntry of this.yarray) {
			if (currentEntry.key === key) {
				this.yarray.delete(index);
				break;
			}
			index++;
		}
		this.map.delete(key);
	}

	/** Get value by key. O(1) via in-memory Map. Returns undefined if not found. */
	get(key: string): T | undefined {
		return this.map.get(key)?.val;
	}

	/** Check if key exists. O(1) via in-memory Map. */
	has(key: string): boolean {
		return this.map.has(key);
	}

	/** Subscribe to changes. Handler receives a Map of key → change info. */
	on(event: 'change', handler: YKeyValueChangeHandler<T>): void {
		if (event === 'change') {
			this.changeHandlers.add(handler);
		}
	}

	/** Unsubscribe from changes. */
	off(event: 'change', handler: YKeyValueChangeHandler<T>): void {
		if (event === 'change') {
			this.changeHandlers.delete(handler);
		}
	}
}
