/**
 * Test utilities for y-websocket protocol testing.
 *
 * Provides helpers for building valid and invalid protocol messages,
 * decoders for parsing messages, and utilities for test coordination.
 */

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

// Import and re-export MESSAGE_TYPE from protocol.ts (single source of truth)
import { MESSAGE_TYPE } from '../../src/server/sync/protocol';
export { MESSAGE_TYPE };

// ============================================================================
// Valid Message Builders
// ============================================================================

/**
 * Build a sync step 1 message containing a state vector.
 * This is what a client sends to ask "what updates are you missing?"
 */
export function buildSyncStep1(doc: Y.Doc): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
	syncProtocol.writeSyncStep1(encoder, doc);
	return encoding.toUint8Array(encoder);
}

/**
 * Build a sync step 2 message containing a document diff.
 * This is the response to sync step 1.
 */
export function buildSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
	if (stateVector) {
		// Generate diff based on provided state vector
		const update = Y.encodeStateAsUpdate(doc, stateVector);
		syncProtocol.writeUpdate(encoder, update);
	} else {
		// Write full document as sync step 2
		syncProtocol.writeSyncStep2(encoder, doc);
	}
	return encoding.toUint8Array(encoder);
}

/**
 * Build a sync update message containing incremental changes.
 */
export function buildSyncUpdate(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
	syncProtocol.writeUpdate(encoder, update);
	return encoding.toUint8Array(encoder);
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
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
	encoding.writeVarUint8Array(encoder, update);
	return encoding.toUint8Array(encoder);
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
	const innerEncoder = encoding.createEncoder();
	encoding.writeVarUint(innerEncoder, entries.length);
	for (const entry of entries) {
		encoding.writeVarUint(innerEncoder, entry.clientId);
		encoding.writeVarUint(innerEncoder, entry.clock);
		encoding.writeVarString(innerEncoder, entry.state ?? 'null');
	}
	const innerUpdate = encoding.toUint8Array(innerEncoder);

	// Wrap in message envelope
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
	encoding.writeVarUint8Array(encoder, innerUpdate);
	return encoding.toUint8Array(encoder);
}

/**
 * Build a query awareness message.
 */
export function buildQueryAwareness(): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.QUERY_AWARENESS);
	return encoding.toUint8Array(encoder);
}

// ============================================================================
// Invalid/Malformed Message Builders (for edge case testing)
// ============================================================================

/**
 * Build a truncated message of the specified type.
 * Contains only the message type byte with no payload.
 */
export function buildTruncatedMessage(messageType: number): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, messageType);
	return encoding.toUint8Array(encoder);
}

/**
 * Build a message with an unknown message type.
 */
export function buildUnknownTypeMessage(unknownType: number): Uint8Array {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, unknownType);
	encoding.writeVarString(encoder, 'unknown payload');
	return encoding.toUint8Array(encoder);
}

/**
 * Build an awareness message with malformed JSON state.
 */
export function buildMalformedAwarenessMessage(): Uint8Array {
	// Create a raw awareness update with invalid JSON
	const innerEncoder = encoding.createEncoder();
	encoding.writeVarUint(innerEncoder, 1); // 1 entry
	encoding.writeVarUint(innerEncoder, 12345); // clientId
	encoding.writeVarUint(innerEncoder, 1); // clock
	encoding.writeVarString(innerEncoder, '{invalid json}'); // malformed JSON
	const innerUpdate = encoding.toUint8Array(innerEncoder);

	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
	encoding.writeVarUint8Array(encoder, innerUpdate);
	return encoding.toUint8Array(encoder);
}

/**
 * Build an empty byte array.
 */
export function buildEmptyMessage(): Uint8Array {
	return new Uint8Array(0);
}

// ============================================================================
// Pure Decoders (functional approach - return data, let tests assert)
// ============================================================================

export type SyncMessage =
	| { type: 'step1'; stateVector: Uint8Array }
	| { type: 'step2'; update: Uint8Array }
	| { type: 'update'; update: Uint8Array };

/**
 * Decode a sync protocol message into its components.
 * Throws if message is not a valid SYNC message.
 */
export function decodeSyncMessage(data: Uint8Array): SyncMessage {
	const decoder = decoding.createDecoder(data);
	const messageType = decoding.readVarUint(decoder);
	if (messageType !== MESSAGE_TYPE.SYNC) {
		throw new Error(`Expected SYNC message (0), got ${messageType}`);
	}

	const syncType = decoding.readVarUint(decoder);
	const payload = decoding.readVarUint8Array(decoder);

	switch (syncType) {
		case syncProtocol.messageYjsSyncStep1:
			return { type: 'step1', stateVector: payload };
		case syncProtocol.messageYjsSyncStep2:
			return { type: 'step2', update: payload };
		case syncProtocol.messageYjsUpdate:
			return { type: 'update', update: payload };
		default:
			throw new Error(`Unknown sync type: ${syncType}`);
	}
}

/**
 * Read the top-level message type from data.
 */
export function decodeMessageType(data: Uint8Array): number {
	const decoder = decoding.createDecoder(data);
	return decoding.readVarUint(decoder);
}

/**
 * Read sync sub-message type from data (after main message type).
 */
export function decodeSyncSubType(data: Uint8Array): number {
	const decoder = decoding.createDecoder(data);
	decoding.readVarUint(decoder); // main message type
	return decoding.readVarUint(decoder);
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
