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

/**
 * Top-level message types in the y-websocket protocol.
 * The first varint in any message identifies its type.
 */
export const MESSAGE_TYPE = {
	/** Document synchronization messages (sync step 1, 2, or update) */
	SYNC: 0,
	/** User presence/cursor information */
	AWARENESS: 1,
	/** Authentication (reserved for future use) */
	AUTH: 2,
	/** Request current awareness states from server */
	QUERY_AWARENESS: 3,
} as const;

export type MessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Helper to create encoded message from a writer function.
 * Equivalent to lib0's encoding.encode() pattern.
 */
function encode(writer: (encoder: encoding.Encoder) => void): Uint8Array {
	const encoder = encoding.createEncoder();
	writer(encoder);
	return encoding.toUint8Array(encoder);
}

// ============================================================================
// Sync Message Encoders
// ============================================================================

/**
 * Encodes a sync step 1 message containing the document's state vector.
 *
 * This is the first message in the Yjs sync protocol handshake. The server
 * sends its state vector to the client, asking "what updates do you have
 * that I'm missing?" The client responds with sync step 2 containing any
 * updates the server doesn't have.
 *
 * @param options.doc - The Yjs document to get the state vector from
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeSyncStep1({ doc }: { doc: Y.Doc }): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		syncProtocol.writeSyncStep1(encoder, doc);
	});
}

/**
 * Encodes a sync step 2 message containing the document diff.
 *
 * This is the response to sync step 1. It contains all updates that the
 * receiver is missing based on their state vector. After both sides exchange
 * sync step 1 and 2, they are fully synchronized.
 *
 * @param options.doc - The Yjs document to compute the diff from
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeSyncStep2({ doc }: { doc: Y.Doc }): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		syncProtocol.writeSyncStep2(encoder, doc);
	});
}

/**
 * Encodes a document update message for broadcasting to clients.
 *
 * After initial sync, any changes to the document are broadcast as update
 * messages. These are incremental and can be applied in any order due to
 * Yjs's CRDT properties.
 *
 * @param options.update - The raw Yjs update bytes (from doc.on('update'))
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeSyncUpdate({ update }: { update: Uint8Array }): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
		syncProtocol.writeUpdate(encoder, update);
	});
}

// ============================================================================
// Awareness Message Encoders
// ============================================================================

/**
 * Encodes an awareness update message from raw awareness bytes.
 *
 * Awareness is used for ephemeral user presence data like cursor positions,
 * user names, and online status. Unlike document updates, awareness state
 * is not persisted and is cleared when users disconnect.
 *
 * @param options.update - Raw awareness update bytes (from awarenessProtocol.encodeAwarenessUpdate)
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeAwareness({ update }: { update: Uint8Array }): Uint8Array {
	return encode((encoder) => {
		encoding.writeVarUint(encoder, MESSAGE_TYPE.AWARENESS);
		encoding.writeVarUint8Array(encoder, update);
	});
}

/**
 * Encodes awareness states for specified clients.
 *
 * Convenience function that combines awareness encoding with message wrapping.
 * Typically used to send current awareness states to newly connected clients.
 *
 * @param options.awareness - The awareness instance containing client states
 * @param options.clients - Array of client IDs whose states should be encoded
 * @returns Encoded message ready to send over WebSocket
 */
export function encodeAwarenessStates({
	awareness,
	clients,
}: {
	awareness: awarenessProtocol.Awareness;
	clients: number[];
}): Uint8Array {
	return encodeAwareness({
		update: awarenessProtocol.encodeAwarenessUpdate(awareness, clients),
	});
}

// ============================================================================
// Message Reading/Handling Helpers
// ============================================================================

/**
 * Reads the message type from raw message data.
 *
 * The first varint in any y-websocket message is the message type:
 * - 0: MESSAGE_SYNC (document sync)
 * - 1: MESSAGE_AWARENESS (user presence)
 * - 2: MESSAGE_AUTH (authentication, reserved)
 * - 3: MESSAGE_QUERY_AWARENESS (request awareness states)
 *
 * @param options.data - Raw message bytes received from WebSocket
 * @returns The message type constant
 */
export function readMessageType({ data }: { data: Uint8Array }): number {
	const decoder = decoding.createDecoder(data);
	return decoding.readVarUint(decoder);
}

/**
 * Handles an incoming sync message and returns a response if needed.
 *
 * This wraps y-protocols' readSyncMessage which has a read-and-write pattern:
 * it reads the incoming message, applies it to the document, and potentially
 * writes a response to an encoder.
 *
 * The sync protocol has three sub-message types:
 * - SyncStep1 (0): Client sends state vector, server responds with SyncStep2
 * - SyncStep2 (1): Contains document diff, no response needed
 * - Update (2): Incremental update, no response needed
 *
 * Only SyncStep1 triggers a response (SyncStep2 containing the diff).
 *
 * @param options.decoder - Decoder positioned after the MESSAGE_SYNC type byte
 * @param options.doc - The Yjs document to sync
 * @param options.origin - Transaction origin (typically the WebSocket, used to prevent echo)
 * @returns Encoded response message if one was generated, null otherwise
 */
export function handleSyncMessage({
	decoder,
	doc,
	origin,
}: {
	decoder: decoding.Decoder;
	doc: Y.Doc;
	origin: unknown;
}): Uint8Array | null {
	const encoder = encoding.createEncoder();
	encoding.writeVarUint(encoder, MESSAGE_TYPE.SYNC);
	syncProtocol.readSyncMessage(decoder, encoder, doc, origin);

	// Only return if there's content beyond the message type byte.
	// readSyncMessage only writes a response for SyncStep1 messages.
	return encoding.length(encoder) > 1 ? encoding.toUint8Array(encoder) : null;
}
