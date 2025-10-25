/**
 * Workspace providers for YJS document capabilities.
 *
 * Providers attach external capabilities to YJS documents:
 * - **Persistence**: Local storage (filesystem, IndexedDB)
 * - **Synchronization**: Real-time collaboration (WebSocket, WebRTC)
 * - **Observability**: Logging, debugging, analytics
 *
 * @module providers
 */

// Hocuspocus real-time collaboration provider
export {
	createHocuspocusProvider,
	type HocuspocusProviderConfig,
} from './hocuspocus';

// Persistence providers (isomorphic and platform-specific)
export {
	setupPersistence,
	setupPersistenceDesktop,
	setupPersistenceWeb,
	EPICENTER_STORAGE_DIR,
} from './persistence';
