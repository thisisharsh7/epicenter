import { Elysia } from 'elysia';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';
import { Ok, trySync } from 'wellcrafted/result';
import {
	MESSAGE_AWARENESS,
	MESSAGE_QUERY_AWARENESS,
	MESSAGE_SYNC,
	encodeAwareness,
	encodeAwarenessStates,
	encodeSyncStep1,
	encodeSyncUpdate,
} from './protocol';

// Note: decoding/encoding imports are still needed for MESSAGE_SYNC handler
// because syncProtocol.readSyncMessage() uses a read-and-write pattern
// that requires an encoder to write its response to.

/** WebSocket close code for room not found (4000-4999 reserved for application use per RFC 6455) */
const CLOSE_ROOM_NOT_FOUND = 4004;

type SyncPluginConfig = {
	/** Get Y.Doc for a room. Called when client connects. */
	getDoc: (room: string) => Y.Doc | undefined;
};

/**
 * Creates an Elysia plugin that provides y-websocket compatible sync.
 *
 * This implements the y-websocket server protocol:
 * - messageSync (0): Document synchronization via y-protocols/sync
 * - messageAwareness (1): User presence via y-protocols/awareness
 * - messageQueryAwareness (3): Request current awareness states
 *
 * Uses Elysia's native WebSocket which leverages Bun's efficient implementation.
 *
 * @example
 * ```typescript
 * const app = new Elysia()
 *   .use(createSyncPlugin({
 *     getDoc: (room) => workspaces.get(room)?.ydoc,
 *   }))
 *   .listen(3913);
 *
 * // Clients connect to: ws://localhost:3913/sync/blog
 * ```
 */
export function createSyncPlugin(config: SyncPluginConfig) {
	/**
	 * Track connections per room for broadcasting.
	 * Uses minimal interface (just `send`) to avoid coupling to complex Elysia WebSocket type.
	 */
	const rooms = new Map<string, Set<{ send: (data: Uint8Array) => void }>>();

	/** Track awareness (user presence) per room. */
	const awarenessMap = new Map<string, awarenessProtocol.Awareness>();

	/**
	 * Store per-connection state using the WebSocket object as key.
	 * WeakMap ensures automatic cleanup when connections close (no memory leaks).
	 * @see docs/articles/weakmap-type-safety.md for why we use WeakMap here.
	 */
	const connectionState = new WeakMap<
		object,
		{
			/** The room this connection belongs to. */
			room: string;
			/** The Yjs document being synced. */
			doc: Y.Doc;
			/** Awareness instance for user presence in this room. */
			awareness: awarenessProtocol.Awareness;
			/** Handler to broadcast doc updates to this client (stored for cleanup). */
			updateHandler: (update: Uint8Array, origin: unknown) => void;
			/** Client IDs this connection controls, for awareness cleanup on disconnect. */
			controlledClientIds: Set<number>;
		}
	>();

	/** Get or create awareness instance for a room. Awareness is lazily created on first connection. */
	const getAwareness = (room: string, doc: Y.Doc): awarenessProtocol.Awareness => {
		if (!awarenessMap.has(room)) {
			awarenessMap.set(room, new awarenessProtocol.Awareness(doc));
		}
		// biome-ignore lint/style/noNonNullAssertion: Value guaranteed to exist - we just set it above if it didn't exist
		return awarenessMap.get(room)!;
	};

	return new Elysia({ prefix: '/sync' }).ws('/:room', {
		open(ws) {
			const { room } = ws.data.params;
			const doc = config.getDoc(room);

			if (!doc) {
				ws.close(CLOSE_ROOM_NOT_FOUND, `Room not found: ${room}`);
				return;
			}

			// Track connection
			if (!rooms.has(room)) {
				rooms.set(room, new Set());
			}
			rooms.get(room)!.add(ws);

			// Track which client IDs this connection controls (for cleanup on disconnect)
			const controlledClientIds = new Set<number>();

			// Get awareness for this room
			const awareness = getAwareness(room, doc);

			// Defer send to next tick to ensure WebSocket is fully ready
			queueMicrotask(() => {
				// Send initial sync step 1
				ws.send(encodeSyncStep1(doc));

				// Send current awareness states
				const awarenessStates = awareness.getStates();
				if (awarenessStates.size > 0) {
					ws.send(
						encodeAwarenessStates(awareness, Array.from(awarenessStates.keys())),
					);
				}
			});

			// Listen for doc updates to broadcast to this client
			const updateHandler = (update: Uint8Array, origin: unknown) => {
				if (origin === ws) return; // Don't echo back
				ws.send(encodeSyncUpdate(update));
			};
			doc.on('update', updateHandler);

			// Store connection state for message/close handlers
			connectionState.set(ws, {
				room,
				doc,
				awareness,
				updateHandler,
				controlledClientIds,
			});
		},

		message(ws, message) {
			const state = connectionState.get(ws);
			if (!state) return;

			const { room, doc, awareness, controlledClientIds } = state;

			const data =
				message instanceof ArrayBuffer
					? new Uint8Array(message)
					: (message as Uint8Array);
			const decoder = decoding.createDecoder(data);
			const messageType = decoding.readVarUint(decoder);

			switch (messageType) {
				case MESSAGE_SYNC: {
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, MESSAGE_SYNC);
					syncProtocol.readSyncMessage(
						decoder,
						encoder,
						doc,
						ws, // origin - so we don't echo back
					);

					// Send response if there's content (more than just the message type)
					if (encoding.length(encoder) > 1) {
						ws.send(encoding.toUint8Array(encoder));
					}
					break;
				}

				case MESSAGE_AWARENESS: {
					const update = decoding.readVarUint8Array(decoder);

					// Decode the update to track which client IDs this connection controls.
					// The update contains [clientID, clock, state?] entries.
					// Use trySync because malformed messages shouldn't crash the connection.
					trySync({
						try: () => {
							const decoder2 = decoding.createDecoder(update);
							const len = decoding.readVarUint(decoder2);
							for (let i = 0; i < len; i++) {
								const clientId = decoding.readVarUint(decoder2);
								decoding.readVarUint(decoder2); // clock
								const state = JSON.parse(decoding.readVarString(decoder2));
								if (state === null) {
									// Client is removing their awareness state
									controlledClientIds.delete(clientId);
								} else {
									// Client is setting their awareness state
									controlledClientIds.add(clientId);
								}
							}
						},
						catch: () => {
							// Malformed awareness update - skip client ID tracking but still apply
							return Ok(undefined);
						},
					});

					awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);

					// Broadcast awareness to other clients in the room
					const conns = rooms.get(room);
					if (conns) {
						const awarenessMessage = encodeAwareness(update);
						for (const conn of conns) {
							if (conn !== ws) {
								conn.send(awarenessMessage);
							}
						}
					}
					break;
				}

				case MESSAGE_QUERY_AWARENESS: {
					// Client is requesting current awareness states
					const awarenessStates = awareness.getStates();
					if (awarenessStates.size > 0) {
						ws.send(
							encodeAwarenessStates(awareness, Array.from(awarenessStates.keys())),
						);
					}
					break;
				}
			}
		},

		close(ws) {
			const state = connectionState.get(ws);
			if (!state) return;

			const { room, doc, updateHandler, awareness, controlledClientIds } = state;

			// Remove update listener
			doc.off('update', updateHandler);

			// Clean up awareness state for all client IDs this connection controlled
			if (controlledClientIds.size > 0) {
				awarenessProtocol.removeAwarenessStates(
					awareness,
					Array.from(controlledClientIds),
					null,
				);
			}

			// Remove from room
			rooms.get(room)?.delete(ws);
			if (rooms.get(room)?.size === 0) {
				rooms.delete(room);
				// Also clean up awareness for empty rooms
				awarenessMap.delete(room);
			}

			// Clean up connection state
			connectionState.delete(ws);
		},
	});
}
