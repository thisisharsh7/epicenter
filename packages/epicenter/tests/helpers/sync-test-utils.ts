/**
 * Test utilities for y-websocket protocol testing.
 *
 * Provides helpers for building valid and invalid protocol messages,
 * and utilities for test coordination.
 *
 * NOTE: For MESSAGE_TYPE, decodeSyncMessage, and decodeMessageType,
 * import directly from '../../src/server/sync/protocol'.
 */

import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';
import { MESSAGE_TYPE } from '../../src/server/sync/protocol';

// ============================================================================
// Valid Message Builders
// ============================================================================

/**
 * Build a sync step 1 message containing a state vector.
 * This is what a client sends to ask "what updates are you missing?"
 */
export function buildSyncStep1(doc: Y.Doc): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		syncProtocol.writeSyncStep1(encoder, doc);
	});
}

/**
 * Build a sync step 2 message containing a document diff.
 * This is the response to sync step 1.
 */
export function buildSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		if (stateVector) {
			// Generate diff based on provided state vector
			const update = Y.encodeStateAsUpdate(doc, stateVector);
			syncProtocol.writeUpdate(encoder, update);
		} else {
			// Write full document as sync step 2
			syncProtocol.writeSyncStep2(encoder, doc);
		}
	});
}

/**
 * Build a sync update message containing incremental changes.
 */
export function buildSyncUpdate(update: Uint8Array): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		syncProtocol.writeUpdate(encoder, update);
	});
}

/**
 * Build an awareness update message.
 */
export function buildAwarenessUpdate(
	awareness: awarenessProtocol.Awareness,
	clientIds?: number[],
): Uint8Array {
	const clients = clientIds ?? Array.from(awareness.getStates().keys());
	const update = awarenessProtocol.encodeAwarenessUpdate(awareness, clients);
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
		encoding.writeVarUint8Array(encoder, update);
	});
}

/**
 * Build a raw awareness update message from explicit data.
 * Useful for testing malformed or edge case awareness states.
 */
export function buildRawAwarenessMessage(entries: Array<{
	clientId: number;
	clock: number;
	state: string | null; // JSON string or null
}>): Uint8Array {
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
		encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
		encoding.writeVarUint8Array(encoder, innerUpdate);
	});
}

/**
 * Build a query awareness message.
 */
export function buildQueryAwareness(): Uint8Array {
	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.QUERY_AWARENESS);
	});
}

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
	// Create a raw awareness update with invalid JSON
	const innerUpdate = encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, 1); // 1 entry
		encoding.writeVarUint(encoder, 12345); // clientId
		encoding.writeVarUint(encoder, 1); // clock
		encoding.writeVarString(encoder, '{invalid json}'); // malformed JSON
	});

	return encoding.encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
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
export function createTestDoc(content?: { mapKey?: string; mapValue?: string }): Y.Doc {
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
				const keys = Object.keys(parsed).map(Number).sort((a, b) => a - b);
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
