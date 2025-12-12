/**
 * Test utilities for y-websocket protocol testing.
 *
 * Provides helpers for building invalid/malformed messages and test coordination.
 *
 * NOTE: For protocol functions (MESSAGE_TYPE, encodeSyncStep1, etc.),
 * import directly from '../../src/server/sync/protocol'.
 */

import * as encoding from 'lib0/encoding';
import * as Y from 'yjs';

// ============================================================================
// Invalid/Malformed Message Builders (for edge case testing)
// ============================================================================

/**
 * Build a truncated message of the specified type.
 * Contains only the message type byte with no payload.
 */
export function buildTruncatedMessage(messageType: number): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, messageType);
	});
}

/**
 * Build a message with an unknown message type.
 */
export function buildUnknownTypeMessage(unknownType: number): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, unknownType);
		encoding.writeVarString(encoder, 'unknown payload');
	});
}

/**
 * Build an awareness message with malformed JSON state.
 */
export function buildMalformedAwarenessMessage(): Uint8Array {
	const MESSAGE_TYPE_AWARENESS = 1;

	// Create a raw awareness update with invalid JSON
	const innerUpdate = encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, 1); // 1 entry
		encoding.writeVarUint(encoder, 12345); // clientId
		encoding.writeVarUint(encoder, 1); // clock
		encoding.writeVarString(encoder, '{invalid json}'); // malformed JSON
	});

	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE_AWARENESS);
		encoding.writeVarUint8Array(encoder, innerUpdate);
	});
}

/**
 * Build a raw awareness update message from explicit data.
 * Useful for testing malformed or edge case awareness states.
 */
export function buildRawAwarenessMessage(
	entries: Array<{
		clientId: number;
		clock: number;
		state: string | null; // JSON string or null
	}>,
): Uint8Array {
	const MESSAGE_TYPE_AWARENESS = 1;

	// Build the inner awareness update
	const innerUpdate = encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, entries.length);
		for (const entry of entries) {
			encoding.writeVarUint(encoder, entry.clientId);
			encoding.writeVarUint(encoder, entry.clock);
			encoding.writeVarString(encoder, entry.state ?? 'null');
		}
	});

	// Wrap in message envelope
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE_AWARENESS);
		encoding.writeVarUint8Array(encoder, innerUpdate);
	});
}

/**
 * Build an empty byte array.
 */
export function buildEmptyMessage(): Uint8Array {
	return new Uint8Array(0);
}

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Wait for a condition to become true.
 */
export async function waitFor(
	condition: () => boolean,
	timeout = 5000,
	interval = 50,
): Promise<void> {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeout) {
			throw new Error(`Condition not met within ${timeout}ms`);
		}
		await new Promise((resolve) => setTimeout(resolve, interval));
	}
}

/**
 * Wait for a specific number of milliseconds.
 */
export function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a Y.Doc with some initial content for testing.
 */
export function createTestDoc(content?: {
	mapKey?: string;
	mapValue?: string;
}): Y.Doc {
	const doc = new Y.Doc();
	if (content) {
		doc.getMap('test').set(content.mapKey ?? 'key', content.mapValue ?? 'value');
	}
	return doc;
}

/**
 * Create a Y.Doc with larger content for stress testing.
 */
export function createLargeTestDoc(itemCount: number): Y.Doc {
	const doc = new Y.Doc();
	const array = doc.getArray<string>('items');
	for (let i = 0; i < itemCount; i++) {
		array.push([`item-${i}-${'x'.repeat(100)}`]);
	}
	return doc;
}

/**
 * Helper to parse WebSocket messages in tests.
 * Handles Bun's behavior of sending binary data as JSON-encoded objects.
 */
export function parseWsMessage(data: unknown): Uint8Array | null {
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	} else if (data instanceof Uint8Array) {
		return data;
	} else if (typeof data === 'object' && data !== null && 'buffer' in data) {
		// Buffer-like object
		return new Uint8Array(data.buffer as ArrayBuffer);
	} else if (typeof data === 'string') {
		try {
			const parsed = JSON.parse(data);
			if (typeof parsed === 'object' && parsed !== null) {
				const keys = Object.keys(parsed)
					.map(Number)
					.sort((a, b) => a - b);
				const arr = new Uint8Array(keys.length);
				for (let i = 0; i < keys.length; i++) {
					arr[i] = parsed[keys[i]];
				}
				return arr;
			}
		} catch {
			// Not JSON
		}
	}
	return null;
}
