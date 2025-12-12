import { Elysia } from 'elysia';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import type * as Y from 'yjs';

const messageSync = 0;
const messageAwareness = 1;
const messageQueryAwareness = 3;

type SyncPluginConfig = {
	/** Get Y.Doc for a room. Called when client connects. */
	getDoc: (room: string) => Y.Doc | undefined;
};

type ConnectionState = {
	room: string;
	doc: Y.Doc;
	awareness: awarenessProtocol.Awareness;
	updateHandler: (update: Uint8Array, origin: unknown) => void;
	controlledClientIds: Set<number>;
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
	// Track connections per room for broadcasting
	const rooms = new Map<string, Set<unknown>>();
	// Track awareness per room
	const awarenessMap = new Map<string, awarenessProtocol.Awareness>();
	// Track connection state per WebSocket (type-safe alternative to ws.data mutations)
	const connectionState = new WeakMap<object, ConnectionState>();

	const getAwareness = (room: string, doc: Y.Doc) => {
		if (!awarenessMap.has(room)) {
			awarenessMap.set(room, new awarenessProtocol.Awareness(doc));
		}
		return awarenessMap.get(room)!;
	};

	return new Elysia({ prefix: '/sync' }).ws('/:room', {
		open(ws) {
			const { room } = ws.data.params;
			const doc = config.getDoc(room);

			if (!doc) {
				ws.close(4004, `Room not found: ${room}`);
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

			// Send initial sync step 1 - defer to ensure socket is ready
			const encoder = encoding.createEncoder();
			encoding.writeVarUint(encoder, messageSync);
			syncProtocol.writeSyncStep1(encoder, doc);
			const syncMessage = encoding.toUint8Array(encoder);

			// Defer send to next tick to ensure WebSocket is fully ready
			queueMicrotask(() => {
				ws.send(syncMessage);

				// Send current awareness states
				const awarenessStates = awareness.getStates();
				if (awarenessStates.size > 0) {
					const awarenessEncoder = encoding.createEncoder();
					encoding.writeVarUint(awarenessEncoder, messageAwareness);
					encoding.writeVarUint8Array(
						awarenessEncoder,
						awarenessProtocol.encodeAwarenessUpdate(
							awareness,
							Array.from(awarenessStates.keys()),
						),
					);
					ws.send(encoding.toUint8Array(awarenessEncoder));
				}
			});

			// Listen for doc updates to broadcast to this client
			const updateHandler = (update: Uint8Array, origin: unknown) => {
				if (origin === ws) return; // Don't echo back
				const updateEncoder = encoding.createEncoder();
				encoding.writeVarUint(updateEncoder, messageSync);
				syncProtocol.writeUpdate(updateEncoder, update);
				ws.send(encoding.toUint8Array(updateEncoder));
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
				case messageSync: {
					const encoder = encoding.createEncoder();
					encoding.writeVarUint(encoder, messageSync);
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

				case messageAwareness: {
					const update = decoding.readVarUint8Array(decoder);

					// Decode the update to track which client IDs this connection controls.
					// The update contains [clientID, clock, state?] entries.
					// Wrapped in try-catch because malformed messages shouldn't crash the connection.
					try {
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
					} catch {
						// Malformed awareness update - skip client ID tracking but still apply
					}

					awarenessProtocol.applyAwarenessUpdate(awareness, update, ws);

					// Broadcast awareness to other clients in the room
					const conns = rooms.get(room);
					if (conns) {
						const awarenessEncoder = encoding.createEncoder();
						encoding.writeVarUint(awarenessEncoder, messageAwareness);
						encoding.writeVarUint8Array(awarenessEncoder, update);
						const awarenessMessage = encoding.toUint8Array(awarenessEncoder);

						for (const conn of conns) {
							if (conn !== ws) {
								(conn as typeof ws).send(awarenessMessage);
							}
						}
					}
					break;
				}

				case messageQueryAwareness: {
					// Client is requesting current awareness states
					const awarenessStates = awareness.getStates();
					if (awarenessStates.size > 0) {
						const awarenessEncoder = encoding.createEncoder();
						encoding.writeVarUint(awarenessEncoder, messageAwareness);
						encoding.writeVarUint8Array(
							awarenessEncoder,
							awarenessProtocol.encodeAwarenessUpdate(
								awareness,
								Array.from(awarenessStates.keys()),
							),
						);
						ws.send(encoding.toUint8Array(awarenessEncoder));
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
