/**
 * # YKeyValue - Efficient Key-Value Store for Yjs
 *
 * Based on [y-utility](https://github.com/yjs/y-utility) (MIT License).
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
 * ## Conflict Resolution: Right-Side Wins
 *
 * When two clients simultaneously set the same key, both entries end up in the
 * array (Yjs merges concurrent inserts). The cleanup logic resolves this:
 *
 * ```
 * Client A: array.push({key:'x', val:'A'})
 * Client B: array.push({key:'x', val:'B'})
 *
 * After sync, array might be:
 *   [{key:'x', val:'A'}, {key:'x', val:'B'}]  // or reversed
 *
 * Cleanup scans right-to-left, keeping only the rightmost 'x':
 *   [{key:'x', val:'B'}]  // B wins (was rightmost)
 * ```
 *
 * This is deterministic—all clients converge to the same state.
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
	readonly yarray: Y.Array<{ key: string; val: T }>;

	/** The Y.Doc that owns this array. Required for transactions. */
	readonly doc: Y.Doc;

	/**
	 * In-memory index for O(1) key lookups. Maps key → entry object.
	 *
	 * This is derived state rebuilt from yarray on init. It stores references to
	 * the actual entry objects in yarray, so `map.get(key) === yarray.get(i)` for
	 * the corresponding index.
	 */
	readonly map: Map<string, { key: string; val: T }>;

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
	constructor(yarray: Y.Array<{ key: string; val: T }>) {
		this.yarray = yarray;
		this.doc = yarray.doc as Y.Doc;
		this.map = new Map();

		const arr = yarray.toArray();
		this.doc.transact(() => {
			for (let i = arr.length - 1; i >= 0; i--) {
				const v = arr[i]!;
				if (this.map.has(v.key)) {
					yarray.delete(i);
				} else {
					this.map.set(v.key, v);
				}
			}
		});

		yarray.observe((event, tr) => {
			const changes = new Map<string, YKeyValueChange<T>>();
			const addedItems: Y.Item[] = Array.from(event.changes.added);

			event.changes.deleted.forEach((ditem) => {
				ditem.content.getContent().forEach((c: { key: string; val: T }) => {
					if (this.map.get(c.key) === c) {
						this.map.delete(c.key);
						changes.set(c.key, { action: 'delete', oldValue: c.val });
					}
				});
			});

			const addedVals = new Map<string, { key: string; val: T }>();
			addedItems
				.flatMap((item) => item.content.getContent())
				.forEach((v: { key: string; val: T }) => {
					addedVals.set(v.key, v);
				});

			const itemsToRemove = new Set<string>();
			const vals = yarray.toArray();

			this.doc.transact(() => {
				for (
					let i = vals.length - 1;
					i >= 0 && (addedVals.size > 0 || itemsToRemove.size > 0);
					i--
				) {
					const currVal = vals[i]!;

					if (itemsToRemove.has(currVal.key)) {
						itemsToRemove.delete(currVal.key);
						yarray.delete(i, 1);
					} else if (addedVals.get(currVal.key) === currVal) {
						const prevValue = this.map.get(currVal.key);
						if (prevValue) {
							itemsToRemove.add(currVal.key);
							changes.set(currVal.key, {
								action: 'update',
								oldValue: prevValue.val,
								newValue: currVal.val,
							});
						} else {
							const delEvent = changes.get(currVal.key);
							if (delEvent && delEvent.action === 'delete') {
								changes.set(currVal.key, {
									action: 'update',
									newValue: currVal.val,
									oldValue: delEvent.oldValue,
								});
							} else {
								changes.set(currVal.key, {
									action: 'add',
									newValue: currVal.val,
								});
							}
						}
						addedVals.delete(currVal.key);
						this.map.set(currVal.key, currVal);
					} else if (addedVals.has(currVal.key)) {
						itemsToRemove.add(currVal.key);
						addedVals.delete(currVal.key);
					}
				}
			});

			if (changes.size > 0) {
				for (const handler of this.changeHandlers) {
					handler(changes, tr);
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
				let i = 0;
				for (const v of this.yarray) {
					if (v.key === key) {
						this.yarray.delete(i);
						break;
					}
					i++;
				}
			}
			this.yarray.push([entry]);
		});

		this.map.set(key, entry);
	}

	/** Delete a key. No-op if key doesn't exist. O(n) scan to find entry. */
	delete(key: string): void {
		if (!this.map.has(key)) return;

		let i = 0;
		for (const val of this.yarray) {
			if (val.key === key) {
				this.yarray.delete(i);
				break;
			}
			i++;
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
