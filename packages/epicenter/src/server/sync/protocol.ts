/**
 * Yjs WebSocket Protocol Encoding Utilities
 *
 * Pure functions for encoding y-websocket protocol messages.
 * Separates protocol encoding from transport (WebSocket handling).
 *
 * Based on patterns from y-redis protocol.js:
 * - Message type constants as first-class exports
 * - Pure encoder functions returning Uint8Array
 * - Single responsibility: encoding only, no transport logic
 *
 * @see https://github.com/yjs/y-redis/blob/main/src/protocol.js
 */

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

// ============================================================================
// Message Type Constants
// ============================================================================

/** Document synchronization messages (sync step 1, 2, or update) */
export const MESSAGE_SYNC = 0;

/** User presence/cursor information */
export const MESSAGE_AWARENESS = 1;

/** Authentication (reserved for future use) */
export const MESSAGE_AUTH = 2;

/** Request current awareness states from server */
export const MESSAGE_QUERY_AWARENESS = 3;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Helper to create encoded message from a writer function.
 * Equivalent to lib0's encoding.encode() pattern.
 */
const encode = (writer: (encoder: encoding.Encoder) => void): Uint8Array => {
	const encoder = encoding.createEncoder();
	writer(encoder);
	return encoding.toUint8Array(encoder);
};

// ============================================================================
// Sync Message Encoders
// ============================================================================

/**
 * Encode sync step 1 message (state vector).
 * Sent by server on connection to initiate sync.
 * Client responds with their state vector + any missing updates.
 */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_SYNC);
		syncProtocol.writeSyncStep1(encoder, doc);
	});
}

/**
 * Encode sync step 2 message (document diff).
 * Sent in response to sync step 1 to provide missing updates.
 */
export function encodeSyncStep2(doc: Y.Doc): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_SYNC);
		syncProtocol.writeSyncStep2(encoder, doc);
	});
}

/**
 * Encode a document update message.
 * Used to broadcast updates to connected clients.
 */
export function encodeSyncUpdate(update: Uint8Array): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_SYNC);
		syncProtocol.writeUpdate(encoder, update);
	});
}

// ============================================================================
// Awareness Message Encoders
// ============================================================================

/**
 * Encode an awareness update message.
 * Takes raw awareness update bytes (from awarenessProtocol.encodeAwarenessUpdate).
 */
export function encodeAwareness(update: Uint8Array): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
		encoding.writeVarUint8Array(encoder, update);
	});
}

/**
 * Encode awareness states for specified clients.
 * Convenience function that combines encoding and message wrapping.
 */
export function encodeAwarenessStates(
	awareness: awarenessProtocol.Awareness,
	clients: number[],
): Uint8Array {
	return encodeAwareness(
		awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
	);
}

// ============================================================================
// Message Reading Helpers
// ============================================================================

/**
 * Read message type from raw message data.
 * Returns the message type constant (MESSAGE_SYNC, MESSAGE_AWARENESS, etc.)
 */
export function readMessageType(data: Uint8Array): number {
	const decoder = decoding.createDecoder(data);
	return decoding.readVarUint(decoder);
}
