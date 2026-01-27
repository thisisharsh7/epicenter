/**
 * # YKeyValueLww - Last-Write-Wins Key-Value Store for Yjs
 *
 * A timestamp-based variant of YKeyValue that uses last-write-wins (LWW) conflict
 * resolution instead of positional ordering.
 *
 * **See also**: `y-keyvalue.ts` for the simpler positional (rightmost-wins) version.
 *
 * ## When to Use This vs YKeyValue
 *
 * | Scenario | Use `YKeyValue` | Use `YKeyValueLww` |
 * |----------|-----------------|-------------------|
 * | Real-time collab | Yes | Either |
 * | Offline-first, multi-device | No | Yes |
 * | Clock sync unreliable | Yes | No |
 * | Need "latest edit wins" | No | Yes |
 *
 * ## How It Works
 *
 * Each entry stores a timestamp alongside the key and value:
 *
 * ```
 * { key: 'user-1', val: { name: 'Alice' }, ts: 1706200000000 }
 * ```
 *
 * When conflicts occur (two clients set the same key while offline), the entry
 * with the **higher timestamp wins**. This gives intuitive "last write wins"
 * semantics.
 *
 * ```
 * Client A (2:00pm): { key: 'x', val: 'A', ts: 1706200400000 }
 * Client B (3:00pm): { key: 'x', val: 'B', ts: 1706204000000 }
 *
 * After sync: B wins (higher timestamp), regardless of sync order
 * ```
 *
 * ## Timestamp Generation
 *
 * Uses a monotonic clock that guarantees:
 * - Local writes always have increasing timestamps (no same-millisecond collisions)
 * - Clock regression is handled (ignores backward jumps)
 *
 * ```typescript
 * // Simplified logic:
 * const now = Date.now();
 * this.lastTs = now > this.lastTs ? now : this.lastTs + 1;
 * return this.lastTs;
 * ```
 *
 * ## Tiebreaker
 *
 * When timestamps are equal (rare - requires synchronized clocks AND coincidental
 * timing), falls back to positional ordering (rightmost wins). This is deterministic
 * because Yjs's CRDT merge produces consistent ordering based on clientID.
 *
 * ## Migration from YKeyValue
 *
 * Entries without a `ts` field (from the original YKeyValue) are treated as `ts: 0`.
 * This means any new timestamped entry automatically wins over old data.
 *
 * ## Limitations
 *
 * - **Clock skew**: If a device's clock is far in the future, its writes win unfairly.
 *   This is rare with NTP and recoverable (correct-clock writes eventually win).
 * - **No tombstones**: Deletes remove the entry entirely. A concurrent delete vs update
 *   is still subject to Yjs merge ordering for the delete operation itself.
 *
 * @example
 * ```typescript
 * import * as Y from 'yjs';
 * import { YKeyValueLww } from './y-keyvalue-lww';
 *
 * const doc = new Y.Doc();
 * const yarray = doc.getArray<{ key: string; val: any; ts: number }>('data');
 * const kv = new YKeyValueLww(yarray);
 *
 * kv.set('user1', { name: 'Alice' });  // ts auto-generated
 * kv.get('user1');  // { name: 'Alice' }
 * ```
 */
import type * as Y from 'yjs';

/** Entry stored in the Y.Array. The `ts` field enables last-write-wins conflict resolution. */
export type YKeyValueLwwEntry<T> = { key: string; val: T; ts: number };

export type YKeyValueLwwChange<T> =
	| { action: 'add'; newValue: T }
	| { action: 'update'; oldValue: T; newValue: T }
	| { action: 'delete'; oldValue: T };

export type YKeyValueLwwChangeHandler<T> = (
	changes: Map<string, YKeyValueLwwChange<T>>,
	transaction: Y.Transaction,
) => void;

export class YKeyValueLww<T> {
	/** The underlying Y.Array that stores `{key, val, ts}` entries. */
	readonly yarray: Y.Array<YKeyValueLwwEntry<T>>;

	/** The Y.Doc that owns this array. Required for transactions. */
	readonly doc: Y.Doc;

	/** In-memory index for O(1) key lookups. Maps key -> entry object. */
	readonly map: Map<string, YKeyValueLwwEntry<T>>;

	/** Registered change handlers. */
	private changeHandlers: Set<YKeyValueLwwChangeHandler<T>> = new Set();

	/** Last timestamp used, for monotonic clock. */
	private lastTs = 0;

	/**
	 * Create a YKeyValueLww wrapper around an existing Y.Array.
	 *
	 * On construction:
	 * 1. Scans the array to build the in-memory Map, keeping highest-timestamp entries
	 * 2. Removes duplicate keys (losers based on timestamp comparison)
	 * 3. Sets up an observer to handle future changes with LWW semantics
	 */
	constructor(yarray: Y.Array<YKeyValueLwwEntry<T>>) {
		this.yarray = yarray;
		this.doc = yarray.doc as Y.Doc;
		this.map = new Map();

		const arr = yarray.toArray();
		const indicesToDelete: number[] = [];

		// First pass: find winners by timestamp
		for (let i = 0; i < arr.length; i++) {
			const entry = arr[i]!;
			const ts = entry.ts ?? 0; // Migration: missing ts = 0
			const existing = this.map.get(entry.key);

			if (!existing) {
				this.map.set(entry.key, entry);
			} else {
				const existingTs = existing.ts ?? 0;
				if (ts > existingTs) {
					// New entry wins, mark old for deletion
					const oldIndex = arr.indexOf(existing);
					if (oldIndex !== -1) indicesToDelete.push(oldIndex);
					this.map.set(entry.key, entry);
				} else if (ts < existingTs) {
					// Old entry wins, mark new for deletion
					indicesToDelete.push(i);
				} else {
					// Equal timestamps: keep later one (rightmost), delete earlier
					const oldIndex = arr.indexOf(existing);
					if (oldIndex !== -1 && oldIndex < i) {
						indicesToDelete.push(oldIndex);
						this.map.set(entry.key, entry);
					} else {
						indicesToDelete.push(i);
					}
				}
			}

			// Track max timestamp for monotonic clock
			if (ts > this.lastTs) this.lastTs = ts;
		}

		// Delete losers
		if (indicesToDelete.length > 0) {
			this.doc.transact(() => {
				// Sort descending to preserve indices during deletion
				indicesToDelete.sort((a, b) => b - a);
				for (const idx of indicesToDelete) {
					yarray.delete(idx);
				}
			});
		}

		// Set up observer for future changes
		yarray.observe((event, tr) => {
			const changes = new Map<string, YKeyValueLwwChange<T>>();
			const addedEntries: Array<{
				entry: YKeyValueLwwEntry<T>;
				index: number;
			}> = [];

			// Collect added entries with their positions
			let idx = 0;
			for (const item of event.changes.added) {
				for (const content of item.content.getContent() as YKeyValueLwwEntry<T>[]) {
					// Find actual index in array
					const arr = yarray.toArray();
					const actualIdx = arr.findIndex((e) => e === content);
					addedEntries.push({ entry: content, index: actualIdx });

					// Track max timestamp
					const ts = content.ts ?? 0;
					if (ts > this.lastTs) this.lastTs = ts;
				}
				idx++;
			}

			// Handle deletions first
			event.changes.deleted.forEach((ditem) => {
				ditem.content.getContent().forEach((c: YKeyValueLwwEntry<T>) => {
					if (this.map.get(c.key) === c) {
						this.map.delete(c.key);
						changes.set(c.key, { action: 'delete', oldValue: c.val });
					}
				});
			});

			// Process added entries with LWW logic
			const indicesToDelete: number[] = [];
			const vals = yarray.toArray();

			for (const { entry: newEntry } of addedEntries) {
				const newTs = newEntry.ts ?? 0;
				const existing = this.map.get(newEntry.key);

				if (!existing) {
					// No existing entry for this key
					const delEvent = changes.get(newEntry.key);
					if (delEvent && delEvent.action === 'delete') {
						// Was deleted in same transaction, now re-added
						changes.set(newEntry.key, {
							action: 'update',
							oldValue: delEvent.oldValue,
							newValue: newEntry.val,
						});
					} else {
						changes.set(newEntry.key, {
							action: 'add',
							newValue: newEntry.val,
						});
					}
					this.map.set(newEntry.key, newEntry);
				} else {
					// Compare timestamps
					const existingTs = existing.ts ?? 0;

					if (newTs > existingTs) {
						// New entry wins
						changes.set(newEntry.key, {
							action: 'update',
							oldValue: existing.val,
							newValue: newEntry.val,
						});

						// Mark old entry for deletion
						const oldIdx = vals.findIndex((e) => e === existing);
						if (oldIdx !== -1) indicesToDelete.push(oldIdx);

						this.map.set(newEntry.key, newEntry);
					} else if (newTs < existingTs) {
						// Old entry wins, delete new entry
						const newIdx = vals.findIndex((e) => e === newEntry);
						if (newIdx !== -1) indicesToDelete.push(newIdx);
					} else {
						// Equal timestamps: positional tiebreaker (rightmost wins)
						const oldIdx = vals.findIndex((e) => e === existing);
						const newIdx = vals.findIndex((e) => e === newEntry);

						if (newIdx > oldIdx) {
							// New is rightmost, it wins
							changes.set(newEntry.key, {
								action: 'update',
								oldValue: existing.val,
								newValue: newEntry.val,
							});
							if (oldIdx !== -1) indicesToDelete.push(oldIdx);
							this.map.set(newEntry.key, newEntry);
						} else {
							// Old is rightmost, delete new
							if (newIdx !== -1) indicesToDelete.push(newIdx);
						}
					}
				}
			}

			// Delete loser entries
			if (indicesToDelete.length > 0) {
				this.doc.transact(() => {
					indicesToDelete.sort((a, b) => b - a);
					for (const idx of indicesToDelete) {
						yarray.delete(idx);
					}
				});
			}

			// Emit change events
			if (changes.size > 0) {
				for (const handler of this.changeHandlers) {
					handler(changes, tr);
				}
			}
		});
	}

	/**
	 * Generate a monotonic timestamp.
	 * Guarantees increasing values even for same-millisecond calls.
	 */
	private getTimestamp(): number {
		const now = Date.now();
		this.lastTs = now > this.lastTs ? now : this.lastTs + 1;
		return this.lastTs;
	}

	/**
	 * Set a key-value pair with automatic timestamp.
	 * The timestamp enables LWW conflict resolution during sync.
	 */
	set(key: string, val: T): void {
		const entry: YKeyValueLwwEntry<T> = { key, val, ts: this.getTimestamp() };
		const existing = this.map.get(key);

		this.doc.transact(() => {
			if (existing) {
				// Find and delete existing entry
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

	/** Delete a key. No-op if key doesn't exist. */
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

	/** Get value by key. O(1) via in-memory Map. */
	get(key: string): T | undefined {
		return this.map.get(key)?.val;
	}

	/** Check if key exists. O(1) via in-memory Map. */
	has(key: string): boolean {
		return this.map.has(key);
	}

	/** Subscribe to changes. */
	on(event: 'change', handler: YKeyValueLwwChangeHandler<T>): void {
		if (event === 'change') {
			this.changeHandlers.add(handler);
		}
	}

	/** Unsubscribe from changes. */
	off(event: 'change', handler: YKeyValueLwwChangeHandler<T>): void {
		if (event === 'change') {
			this.changeHandlers.delete(handler);
		}
	}
}
