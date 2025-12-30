# Blob Storage Redesign

**Created**: 2025-12-30  
**Status**: Planning  
**Author**: Braden + Claude

## Overview

Redesign the blob storage system to be simpler, content-addressed, and automatically synchronized via YJS awareness with automatic server discovery.

## Goals

1. **Simplicity**: Minimal client API (`upload` only; display via URL)
2. **Content-addressed**: SHA-256 hash as blob ID (deduplication, integrity)
3. **Flat storage**: No namespacing, blobs shared across all tables
4. **Automatic discovery**: Connect to one server, discover all others via awareness
5. **Native caching**: Browser HTTP cache handles storage automatically
6. **Server-to-server sync**: HTTP polling, no complex coordination
7. **Append-only**: No delete sync complexity (GC deferred to v2)

## Non-Goals (v1)

- Delta sync / chunking for large files
- Garbage collection (deferred to v2)
- Blob versioning
- Cloud storage integration (S3, R2) - will be v2 feature
- Browser-side storage management (native HTTP cache handles it)
- Encryption / Compression

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BLOB STORAGE ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────┘

  CLIENT (Browser)                       SERVERS
  ───────────────                        ───────

  <img src="/blobs/sha256-abc">          Server A (laptop.tailnet.ts.net)
           │                             ┌──────────────────┐
           ▼                             │ .epicenter/      │
  ┌────────────────────┐                 │   blobs/         │
  │   Service Worker   │◄───HTTP────────►│     sha256-abc   │
  │  (intercepts /blobs)│                │     sha256-def   │
  └────────────────────┘                 └──────────────────┘
           │                                      ▲
           ▼                                      │ HTTP Polling
  ┌────────────────────┐                          │ (every 30s)
  │  Browser HTTP Cache│                          ▼
  │  (Cache-Control:   │                 Server B (desktop.tailnet.ts.net)
  │   immutable)       │                 ┌──────────────────┐
  └────────────────────┘                 │ .epicenter/      │
                                         │   blobs/         │
                                         │     sha256-ghi   │
                                         └──────────────────┘

  KEY INSIGHT: Content-addressed = immutable = cache forever
```

### Design Principles

1. **Native HTTP Caching**: Browser's built-in cache handles storage via `Cache-Control: immutable`
2. **Service Worker for Stable URLs**: `/blobs/:hash` URLs work regardless of which server is available
3. **Server Discovery via Awareness**: Clients discover server URLs automatically
4. **Server-to-Server HTTP Sync**: Servers poll each other every 30s, no awareness hash lists
5. **Upload Once**: Client uploads to ONE best server; servers handle distribution

### Why This Is Simpler

| Old Approach                        | New Approach                          |
| ----------------------------------- | ------------------------------------- |
| OPFS storage in browser             | Native HTTP cache (automatic)         |
| Awareness broadcasts all hash lists | Awareness broadcasts only server URLs |
| Complex sync state machine          | Service Worker + HTTP polling         |
| Browser manages blob lifecycle      | Browser cache auto-evicts as needed   |
| Custom deduplication logic          | HTTP caching handles it               |

---

## Content Addressing

### Why SHA-256?

| Feature           | Benefit                                        |
| ----------------- | ---------------------------------------------- |
| **Integrity**     | Verify received content matches hash           |
| **Deduplication** | Same file = same hash = stored once            |
| **Sync-friendly** | Compare hash lists to find missing blobs       |
| **Immutable**     | Content never changes (new content = new hash) |

### Hash Format

```
sha256-<64 hex characters>

Example: sha256-a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd
```

**Why hyphen instead of colon?**

- ✅ Windows filesystem compatible (colon not allowed in filenames)
- ✅ S3/R2 object key compatible
- ✅ Future-proof (easy to add `blake3-`, `sha512-`, etc.)
- ✅ URL-safe (no encoding needed)

### Hashing Implementation

```typescript
// packages/epicenter/src/core/blobs/hash.ts

/**
 * Hash a blob using SHA-256 and return with sha256- prefix.
 *
 * This is called BOTH on upload (browser) and verification (server):
 * - Browser: Hash before storing locally + before pushing to server
 * - Server: Hash on PUT to verify integrity
 */
export async function hashBlob(
	data: Blob | File | ArrayBuffer,
): Promise<string> {
	const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();

	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return `sha256-${hashHex}`;
}
```

**Key design decision**: Browser hashes BEFORE storing locally. This ensures:

1. Browser stores the blob in OPFS immediately (no waiting for server)
2. Browser knows the hash to reference in the Y.Doc row
3. Server can verify integrity when blob is pushed
4. Same hash = same file = automatic deduplication

---

## Storage

### Storage Model

```
┌─────────────────────────────────────────────────────────────────┐
│                      STORAGE MODEL                               │
└─────────────────────────────────────────────────────────────────┘

BROWSER                                SERVER
────────                               ───────

No explicit storage!                   Filesystem:
                                       .epicenter/blobs/
Browser's native HTTP cache              sha256-a1b2c3d4...
handles caching automatically            sha256-e5f6g7h8...
via Cache-Control: immutable

Service Worker manages                 Server manages
cache hits/misses                      storage + sync
```

### Key Design Decision: No Browser Storage

| Old Design (OPFS)      | New Design (HTTP Cache) |
| ---------------------- | ----------------------- |
| Manual OPFS management | Browser handles it      |
| Custom cache eviction  | Browser handles it      |
| Hash list tracking     | Not needed              |
| Sync state machine     | Service Worker + HTTP   |

**Why this is better**:

1. Browser cache is battle-tested and efficient
2. Automatic eviction when disk is full
3. No custom storage code to maintain
4. Works with existing HTTP caching infrastructure

### No Namespacing

Blobs are NOT namespaced by table or column. The same image used in `posts.coverImage` and `users.avatar` is stored once (deduplication via content addressing).

### Server Implementation (Bun Filesystem)

```typescript
// packages/epicenter/src/core/blobs/storage.node.ts

import path from 'path';
import { hashBlob } from './hash';

export function createBlobStorage(epicenterDir: string) {
	const blobsDir = path.join(epicenterDir, 'blobs');

	return {
		async put(data: Blob | File | ArrayBuffer): Promise<string> {
			const hash = await hashBlob(data);
			const filePath = path.join(blobsDir, hash);
			await Bun.write(filePath, data, { createPath: true });
			return hash;
		},

		async get(hash: string): Promise<Blob | null> {
			const filePath = path.join(blobsDir, hash);
			const file = Bun.file(filePath);
			if (await file.exists()) {
				return file;
			}
			return null;
		},

		async has(hash: string): Promise<boolean> {
			const filePath = path.join(blobsDir, hash);
			return Bun.file(filePath).exists();
		},

		async list(): Promise<string[]> {
			const glob = new Bun.Glob('sha256-*');
			const hashes: string[] = [];
			for await (const file of glob.scan(blobsDir)) {
				hashes.push(file);
			}
			return hashes;
		},

		async delete(hash: string): Promise<void> {
			const filePath = path.join(blobsDir, hash);
			try {
				await Bun.file(filePath).delete();
			} catch {
				// Ignore if not found
			}
		},
	};
}
```

---

## Discovery Architecture

### The Problem

User has multiple devices on Tailscale network:

- Phone (browser) - No server, just client
- Laptop (server) - `laptop.tailnet.ts.net:3913`
- Desktop (server) - `desktop.tailnet.ts.net:3913`
- Cloud (server) - `cloud.mydomain.com:3913`

**Question**: How does the phone discover all servers without manual configuration?

### The Solution: Awareness-Based Discovery

```
┌─────────────────────────────────────────────────────────────────┐
│                   DISCOVERY ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────┘

STEP 1: User configures ONE entry point
────────────────────────────────────────
Phone browser connects to:
ws://laptop.tailnet.ts.net:3913/workspaces/blog/sync

Only ONE URL needed in config!


STEP 2: Awareness broadcasts server URLs (NO hash lists!)
──────────────────────────────────────────────────────────
Laptop server awareness state:
{
  type: 'server',
  url: 'http://laptop.tailnet.ts.net:3913'  ← Just the URL, that's it!
}

Desktop server awareness state (connected to laptop):
{
  type: 'server',
  url: 'http://desktop.tailnet.ts.net:3913'
}

Phone receives BOTH awareness states via WebSocket!
NO hash lists in awareness = minimal bandwidth.


STEP 3: Phone auto-discovers all servers
─────────────────────────────────────────
Phone's awareness listener sees:
- laptop.tailnet.ts.net:3913 (connected via WebSocket)
- desktop.tailnet.ts.net:3913 (discovered via awareness)
- cloud.mydomain.com:3913 (discovered if desktop is connected to cloud)

Service Worker now knows ALL blob storage endpoints automatically!


STEP 4: Service Worker handles blob requests
─────────────────────────────────────────────
UI renders: <img src="/blobs/sha256-abc">

Service Worker intercepts:
1. Check browser cache → HIT? Return cached blob
2. MISS? Try servers in order until one responds
3. Cache response with Cache-Control: immutable
4. Return blob to UI
```

### Key Insight

**Awareness is for DISCOVERY only, not for sync!**

| What Awareness Does      | What Awareness Does NOT Do       |
| ------------------------ | -------------------------------- |
| Broadcasts server URLs   | ~~Broadcast blob hash lists~~    |
| Enables auto-discovery   | ~~Compare hashes between peers~~ |
| Minimal state (just URL) | ~~Trigger sync operations~~      |

- **WebSocket sync**: Connect to ONE known server (manual config)
- **Server discovery**: Learn other server URLs via awareness (automatic)
- **Blob fetching**: Service Worker tries available servers
- **Server sync**: HTTP polling between servers (separate from awareness)

### Discovery Flow Diagram

```
Phone                     Laptop Server              Desktop Server
─────                     ─────────────              ──────────────

Connect WebSocket ────→   Receives connection
                          Sends awareness:
                          { type: 'server',
                            url: 'http://laptop...' }

Receives awareness   ←────
SW learns: laptop
                          Desktop is also connected:
Receives awareness   ←──────────────────────────── { type: 'server',
SW learns: desktop                                   url: 'http://desktop...' }

Service Worker now knows both servers!
Can fetch blobs from either.
```

┌─────────────────────────────────────────────────────────────────┐
│ DISCOVERY ARCHITECTURE │
└─────────────────────────────────────────────────────────────────┘

STEP 1: User configures ONE entry point
────────────────────────────────────────
Phone browser connects to:
ws://laptop.tailnet.ts.net:3913/workspaces/blog/sync

Only ONE URL needed in config!

STEP 2: Awareness broadcasts server URLs
─────────────────────────────────────────
Laptop server awareness state:
{
type: 'server',
url: 'http://laptop.tailnet.ts.net:3913', ← HTTP for blob transfers
blobHashes: ['sha256-abc...', 'sha256-def...']
}

Desktop server awareness state (connected to laptop):
{
type: 'server',
url: 'http://desktop.tailnet.ts.net:3913',
blobHashes: ['sha256-ghi...', 'sha256-jkl...']
}

Phone receives BOTH awareness states via WebSocket!

STEP 3: Phone auto-discovers all servers
─────────────────────────────────────────
Phone's awareness listener sees:

- laptop.tailnet.ts.net:3913 (connected via WebSocket)
- desktop.tailnet.ts.net:3913 (discovered via awareness)
- cloud.mydomain.com:3913 (discovered if desktop is connected to cloud)

Phone now knows ALL blob storage endpoints automatically!

STEP 4: Blob sync uses discovered URLs
───────────────────────────────────────
Phone needs sha256-ghi:
GET http://desktop.tailnet.ts.net:3913/blobs/sha256-ghi

Phone has unique blob:
PUT http://laptop.tailnet.ts.net:3913/blobs/sha256-xyz

```

### Key Insight

**The `url` field in awareness state IS the discovery mechanism!**

- **WebSocket sync**: Connect to ONE known server (manual config)
- **Blob sync**: Use HTTP URLs discovered via awareness (automatic)
- **No additional configuration** needed beyond the first connection

### Discovery Flow Diagram

```

Phone Laptop Server Desktop Server
───── ───────────── ──────────────

Connect WebSocket ────→ Receives connection
Sends awareness:
{ url: 'http://laptop...',
blobHashes: [...] }

Receives awareness ←────
Discovers: laptop
Desktop is also connected:
Receives awareness ←──────────────────────────── { url: 'http://desktop...',
Discovers: desktop blobHashes: [...] }

Now knows both servers!
Can GET/PUT to either.

````

---

## Awareness State (Simplified)

### Awareness State Type

```typescript
// packages/epicenter/src/core/blobs/types.ts

/**
 * Awareness state for server discovery.
 *
 * IMPORTANT: Awareness is for DISCOVERY only!
 * - NO blob hash lists (that was the old design)
 * - Browsers don't broadcast anything for blobs
 * - Servers broadcast only their HTTP URL
 *
 * Server sync happens via HTTP polling, NOT awareness.
 */
type BlobAwareness = {
	type: 'server';
	url: string; // HTTP URL for blob GET/PUT (e.g., 'http://laptop.tailnet:3913')
};

// Browsers don't have blob awareness state - they're consumers, not servers
```

### Why No Hash Lists in Awareness?

| Old Design (Complex) | New Design (Simple) |
|---------------------|---------------------|
| Every peer broadcasts all hashes | Servers broadcast only URL |
| O(peers × blobs) awareness size | O(servers) awareness size |
| Complex diff/sync logic | Service Worker handles fetch |
| Awareness triggers sync | HTTP polling syncs servers |

**Key insight**: Content-addressed storage + HTTP caching = awareness doesn't need to know what blobs exist. The Service Worker just tries to fetch; if it works, great. If not, blob doesn't exist yet.

### Server Discovery Implementation

```typescript
// packages/epicenter/src/client/blob-awareness.ts

import type { Awareness } from 'y-protocols/awareness';
import { trySync } from 'wellcrafted';

/**
 * Extract server URLs from awareness state.
 *
 * Called by Service Worker (via postMessage) to get current server list.
 * Servers come and go; awareness keeps the list current.
 */
export function getServerUrlsFromAwareness(awareness: Awareness): string[] {
	const urls: string[] = [];

	for (const [, state] of awareness.getStates()) {
		const blobState = state.blobs as BlobAwareness | undefined;
		if (blobState?.type === 'server' && blobState.url) {
			urls.push(blobState.url);
		}
	}

	return urls;
}

/**
 * Set up awareness listener to notify Service Worker of server changes.
 */
export function setupServerDiscovery(awareness: Awareness) {
	const notifyServiceWorker = () => {
		const urls = getServerUrlsFromAwareness(awareness);
		navigator.serviceWorker.controller?.postMessage({
			type: 'SERVER_LIST_UPDATE',
			servers: urls,
		});
	};

	// Notify on any awareness change
	awareness.on('change', notifyServiceWorker);

	// Initial notification
	notifyServiceWorker();

	return () => awareness.off('change', notifyServiceWorker);
}
```

### Server Awareness Setup

```typescript
// packages/epicenter/src/server/awareness-setup.ts

import type { Awareness } from 'y-protocols/awareness';

/**
 * Server broadcasts its HTTP URL via awareness.
 *
 * This is ALL the server needs to do for blob discovery.
 * Actual blob sync happens via HTTP polling (see server-sync.ts).
 */
export function setupServerBlobAwareness(awareness: Awareness, serverUrl: string) {
	awareness.setLocalStateField('blobs', {
		type: 'server',
		url: serverUrl,
	});
}
---

## Service Worker (Browser Blob Handling)

The Service Worker is the key to the simplified architecture. It provides stable `/blobs/:hash` URLs that work regardless of which servers are available.

### Why Service Worker?

| Without SW | With SW |
|------------|---------|
| UI must know server URLs | UI uses stable `/blobs/:hash` |
| UI handles failover logic | SW handles failover transparently |
| Complex state management | Native HTTP caching |
| Manual cache invalidation | Immutable content = cache forever |

### Service Worker Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   SERVICE WORKER FLOW                            │
└─────────────────────────────────────────────────────────────────┘

UI renders:
<img src="/blobs/sha256-abc123">

         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVICE WORKER                               │
│                                                                 │
│  1. Intercept /blobs/:hash request                              │
│  2. Check Cache Storage (cache-first)                           │
│     ├─ HIT → Return cached response (instant!)                  │
│     └─ MISS → Continue to step 3                                │
│  3. Try servers in order:                                       │
│     ├─ GET http://laptop.tailnet:3913/blobs/sha256-abc123       │
│     ├─ GET http://desktop.tailnet:3913/blobs/sha256-abc123      │
│     └─ GET http://cloud.example.com:3913/blobs/sha256-abc123    │
│  4. First 200 response → Cache it → Return to UI                │
│  5. All fail → Return 404                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Service Worker Implementation

```typescript
// public/epicenter-sw.js (or epicenter-blobs-sw.js)

/**
 * Epicenter Blob Service Worker
 *
 * Provides stable /blobs/:hash URLs with cache-first strategy.
 * Server list is updated via postMessage from main thread.
 */

const CACHE_NAME = 'epicenter-blobs-v1';
const BLOB_PATH_REGEX = /^\/blobs\/(sha256-[a-f0-9]{64})$/;

/** @type {string[]} */
let serverUrls = [];

// Receive server list updates from main thread
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SERVER_LIST_UPDATE') {
		serverUrls = event.data.servers;
		console.log('[SW] Server list updated:', serverUrls);
	}
});

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const match = url.pathname.match(BLOB_PATH_REGEX);

	if (!match) return; // Not a blob request, let it through

	const hash = match[1];
	event.respondWith(handleBlobRequest(hash, event.request));
});

/**
 * Handle blob request with cache-first strategy.
 */
async function handleBlobRequest(hash: string, request: Request): Promise<Response> {
	const cache = await caches.open(CACHE_NAME);

	// 1. Check cache first (instant if hit)
	const cached = await cache.match(`/blobs/${hash}`);
	if (cached) {
		console.log(`[SW] Cache HIT: ${hash}`);
		return cached;
	}

	// 2. Try servers in order
	for (const serverUrl of serverUrls) {
		const result = await tryFetchFromServer(serverUrl, hash);
		if (result.ok) {
			// Cache the response (clone because body can only be read once)
			const responseToCache = result.value.clone();

			// Add immutable cache headers for the cached copy
			const headers = new Headers(responseToCache.headers);
			headers.set('Cache-Control', 'public, max-age=31536000, immutable');

			const cachedResponse = new Response(responseToCache.body, {
				status: responseToCache.status,
				statusText: responseToCache.statusText,
				headers,
			});

			await cache.put(`/blobs/${hash}`, cachedResponse);
			console.log(`[SW] Cached: ${hash} from ${serverUrl}`);

			return result.value;
		}
	}

	// 3. All servers failed
	console.warn(`[SW] Blob not found on any server: ${hash}`);
	return new Response('Blob not found', { status: 404 });
}

/**
 * Try to fetch blob from a single server.
 * Returns { ok: true, value: Response } or { ok: false }.
 */
async function tryFetchFromServer(
	serverUrl: string,
	hash: string
): Promise<{ ok: true; value: Response } | { ok: false }> {
	try {
		const response = await fetch(`${serverUrl}/blobs/${hash}`, {
			// Don't send credentials to third-party servers
			credentials: 'omit',
		});

		if (response.ok) {
			return { ok: true, value: response };
		}

		return { ok: false };
	} catch (error) {
		console.warn(`[SW] Failed to fetch from ${serverUrl}:`, error);
		return { ok: false };
	}
}

// Activate immediately
self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});
```

### Service Worker Registration

```typescript
// packages/epicenter/src/client/register-sw.ts

import { tryAsync } from 'wellcrafted';

/**
 * Register the Epicenter blob service worker.
 *
 * Called automatically by createClient() if blobs are enabled.
 * The SW path can be customized in client config.
 */
export async function registerBlobServiceWorker(swPath = '/epicenter-sw.js') {
	if (!('serviceWorker' in navigator)) {
		console.warn('[Epicenter] Service Workers not supported; blob caching disabled');
		return;
	}

	const result = await tryAsync(
		async () => navigator.serviceWorker.register(swPath),
		(error) => ({ message: 'Failed to register service worker', cause: error }),
	);

	if (!result.ok) {
		console.error('[Epicenter] SW registration failed:', result.error);
		return;
	}

	console.log('[Epicenter] Blob service worker registered');
}
```

### Integration with createClient()

```typescript
// packages/epicenter/src/client/client.ts

export async function createClient(config: EpicenterConfig) {
	// ... existing client setup ...

	// Register blob service worker if in browser
	if (typeof window !== 'undefined' && config.blobs?.enabled !== false) {
		await registerBlobServiceWorker(config.blobs?.swPath);

		// Set up awareness listener to update SW with server list
		setupServerDiscovery(awareness);
	}

	// ... rest of client setup ...
}
```

---

## Server HTTP Endpoints (ElysiaJS)

### Endpoint Overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/blobs/:hash` | GET | Retrieve blob with cache headers + range support |
| `/blobs/:hash` | PUT | Store blob with hash verification |
| `/blobs` | GET | List all hashes (for server-to-server sync) |

### Implementation

```typescript
// packages/epicenter/src/server/blobs.ts

import { Elysia } from 'elysia';
import { Err, Ok } from 'wellcrafted';
import type { BlobStorage } from '../core/blobs/types';
import { hashBlob } from '../core/blobs/hash';
import { BlobErr } from '../core/blobs/errors';

/**
 * Create blob storage HTTP routes for ElysiaJS.
 *
 * Key features:
 * - Cache-Control: immutable for content-addressed blobs
 * - Range request support for audio/video streaming
 * - GET /blobs list endpoint for server-to-server sync
 */
export function createBlobRoutes(storage: BlobStorage) {
	return new Elysia({ prefix: '/blobs' })
		// GET /blobs/:hash - Retrieve blob with caching + range support
		.get('/:hash', async ({ params: { hash }, request, set, status }) => {
			if (!hash.startsWith('sha256-')) {
				return status(400, Err(BlobErr({
					message: 'Invalid hash format',
					context: { code: 'INVALID_HASH_FORMAT', hash },
				})));
			}

			const blob = await storage.get(hash);
			if (!blob) {
				return status(404, Err(BlobErr({
					message: 'Blob not found',
					context: { code: 'BLOB_NOT_FOUND', hash },
				})));
			}

			// Content-addressed = immutable = cache forever
			set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
			set.headers['Content-Type'] = blob.type || 'application/octet-stream';
			set.headers['Content-Length'] = String(blob.size);
			set.headers['Accept-Ranges'] = 'bytes';
			set.headers['ETag'] = `"${hash}"`;

			// Handle range requests for audio/video streaming
			const rangeHeader = request.headers.get('Range');
			if (rangeHeader) {
				return handleRangeRequest(blob, rangeHeader, set, status);
			}

			return blob;
		})

		// PUT /blobs/:hash - Store blob with hash verification
		.put('/:hash', async ({ params: { hash }, body, status }) => {
			if (!hash.startsWith('sha256-')) {
				return status(400, Err(BlobErr({
					message: 'Invalid hash format',
					context: { code: 'INVALID_HASH_FORMAT', hash },
				})));
			}

			const blob = body as Blob;
			const actualHash = await hashBlob(blob);

			if (actualHash !== hash) {
				console.warn(`Hash mismatch: expected ${hash}, got ${actualHash}`);
				return status(400, Err(BlobErr({
					message: 'Hash mismatch',
					context: { code: 'HASH_MISMATCH', expected: hash, actual: actualHash },
				})));
			}

			await storage.put(blob);
			return status(201, Ok({ hash: actualHash }));
		})

		// GET /blobs - List all hashes (for server-to-server sync)
		.get('/', async () => {
			const hashes = await storage.list();
			return Ok({ hashes });
		});
}

/**
 * Handle HTTP Range requests for audio/video streaming.
 *
 * Allows seeking in media files without downloading the entire blob.
 */
async function handleRangeRequest(
	blob: Blob,
	rangeHeader: string,
	set: any,
	status: any,
) {
	const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
	if (!match) {
		return status(416, Err(BlobErr({
			message: 'Invalid range format',
			context: { code: 'INVALID_RANGE', range: rangeHeader },
		})));
	}

	const start = parseInt(match[1], 10);
	const end = match[2] ? parseInt(match[2], 10) : blob.size - 1;

	if (start >= blob.size || end >= blob.size || start > end) {
		set.headers['Content-Range'] = `bytes */${blob.size}`;
		return status(416, Err(BlobErr({
			message: 'Range not satisfiable',
			context: { code: 'RANGE_NOT_SATISFIABLE', start, end, size: blob.size },
		})));
	}

	const sliced = blob.slice(start, end + 1);

	set.headers['Content-Range'] = `bytes ${start}-${end}/${blob.size}`;
	set.headers['Content-Length'] = String(sliced.size);
	set.status = 206; // Partial Content

	return sliced;
}
```

### Integration with Main Server

```typescript
// packages/epicenter/src/server/server.ts

import { Elysia } from 'elysia';
import { createBlobRoutes } from './blobs';
import { createBlobStorage } from '../core/blobs';

export function createServer(config: ServerConfig) {
	const storage = createBlobStorage(config.epicenterDir);

	const app = new Elysia()
		.use(createSyncPlugin({ ... }))
		.use(createTablesPlugin({ ... }))
		.use(createBlobRoutes(storage))
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
		}));

	return app;
}
```

### ElysiaJS Patterns

**Use `status()` helper**, not `set.status` for error responses:

```typescript
// ✅ CORRECT
({ status }) => status(400, Err(error))

// ❌ INCORRECT
({ set }) => { set.status = 400; return { error }; }
```

**Use `set.headers` for response headers** (not returned in body):

```typescript
// ✅ CORRECT
({ set }) => {
	set.headers['Cache-Control'] = 'public, max-age=31536000, immutable';
	return blob;
}
```

---

## Server-to-Server Sync (HTTP Polling)

Servers sync with each other using simple HTTP polling. No awareness hash lists, no complex coordination.

### Why HTTP Polling?

| Alternative | Problem |
|-------------|---------|
| Syncthing | 34MB binary, overkill for blob sync |
| WebRTC | Complex, requires signaling server |
| Awareness hash lists | O(peers × blobs) state size |
| **HTTP polling** | Simple, stateless, uses existing endpoints |

### Sync Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│                   SERVER-TO-SERVER SYNC                          │
└─────────────────────────────────────────────────────────────────┘

Every 30 seconds, each server:

1. GET other servers from awareness
   ────────────────────────────────
   awareness.getStates() → ['http://laptop:3913', 'http://desktop:3913']

2. For each other server, GET /blobs to list their hashes
   ──────────────────────────────────────────────────────
   GET http://laptop:3913/blobs → { hashes: ['sha256-abc', 'sha256-def'] }
   GET http://desktop:3913/blobs → { hashes: ['sha256-ghi'] }

3. Compare with local hashes, find missing
   ─────────────────────────────────────────
   local:  ['sha256-abc']
   laptop: ['sha256-abc', 'sha256-def']
   desktop: ['sha256-ghi']

   missing: ['sha256-def', 'sha256-ghi']

4. Fetch missing blobs
   ─────────────────────
   GET http://laptop:3913/blobs/sha256-def → store locally
   GET http://desktop:3913/blobs/sha256-ghi → store locally

5. Done! Wait 30 seconds, repeat.
```

### Implementation

```typescript
// packages/epicenter/src/server/blob-sync.ts

import type { Awareness } from 'y-protocols/awareness';
import { tryAsync } from 'wellcrafted';
import type { BlobStorage } from '../core/blobs/types';

const SYNC_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Start server-to-server blob sync via HTTP polling.
 *
 * Uses awareness to discover other servers, then polls their
 * GET /blobs endpoint to find missing blobs.
 */
export function startBlobSync(params: {
	awareness: Awareness;
	storage: BlobStorage;
	myUrl: string; // This server's URL (to skip self)
}) {
	const { awareness, storage, myUrl } = params;
	let running = true;

	const sync = async () => {
		if (!running) return;

		const otherServers = getOtherServerUrls(awareness, myUrl);
		if (otherServers.length === 0) {
			return; // No other servers to sync with
		}

		const localHashes = new Set(await storage.list());
		const missingBlobs: Array<{ hash: string; serverUrl: string }> = [];

		// 1. Fetch hash lists from all other servers
		for (const serverUrl of otherServers) {
			const result = await tryAsync(
				async () => {
					const response = await fetch(`${serverUrl}/blobs`);
					if (!response.ok) return null;
					const data = await response.json();
					return data.ok ? data.value.hashes : null;
				},
				(error) => ({ message: `Failed to list blobs from ${serverUrl}`, cause: error }),
			);

			if (!result.ok || !result.value) continue;

			for (const hash of result.value) {
				if (!localHashes.has(hash)) {
					missingBlobs.push({ hash, serverUrl });
				}
			}
		}

		// 2. Fetch missing blobs (deduplicated by hash)
		const seen = new Set<string>();
		for (const { hash, serverUrl } of missingBlobs) {
			if (seen.has(hash)) continue;
			seen.add(hash);

			const result = await tryAsync(
				async () => {
					const response = await fetch(`${serverUrl}/blobs/${hash}`);
					if (!response.ok) return null;
					return response.blob();
				},
				(error) => ({ message: `Failed to fetch ${hash} from ${serverUrl}`, cause: error }),
			);

			if (result.ok && result.value) {
				await storage.put(result.value);
				console.log(`[BlobSync] Synced ${hash} from ${serverUrl}`);
			}
		}
	};

	// Start polling loop
	const poll = async () => {
		while (running) {
			await sync();
			await new Promise((resolve) => setTimeout(resolve, SYNC_INTERVAL_MS));
		}
	};

	poll(); // Fire and forget

	// Return cleanup function
	return () => {
		running = false;
	};
}

function getOtherServerUrls(awareness: Awareness, myUrl: string): string[] {
	const urls: string[] = [];
	for (const [, state] of awareness.getStates()) {
		const blobState = state.blobs;
		if (blobState?.type === 'server' && blobState.url !== myUrl) {
			urls.push(blobState.url);
		}
	}
	return urls;
}
```

### Integration with Server Startup

```typescript
// packages/epicenter/src/server/server.ts

export function createServer(config: ServerConfig) {
	const storage = createBlobStorage(config.epicenterDir);
	const awareness = /* ... from YJS setup ... */;

	// Set up blob awareness (broadcast our URL)
	setupServerBlobAwareness(awareness, config.serverUrl);

	// Start server-to-server blob sync
	const stopBlobSync = startBlobSync({
		awareness,
		storage,
		myUrl: config.serverUrl,
	});

	// ... rest of server setup ...

	return {
		app,
		stop: () => {
			stopBlobSync();
			// ... other cleanup ...
		},
	};
}
```

### Sync Characteristics

| Property | Value |
|----------|-------|
| Interval | 30 seconds |
| Direction | Pull-only (servers pull from each other) |
| Deduplication | By hash (only fetch each blob once) |
| Failure handling | Skip failed servers, retry next cycle |
| Bandwidth | Minimal (only hash lists + missing blobs) |

---

## Client Upload Flow

When a browser uploads a blob, it uploads to ONE server. That server will sync to others via HTTP polling.

### Why Upload to ONE Server?

| Upload to ALL | Upload to ONE |
|---------------|---------------|
| Upload bandwidth × N servers | Upload bandwidth × 1 |
| Complex coordination | Simple PUT request |
| Partial upload failures | Single success/fail |
| Client must know all servers | Client picks best server |

### Server Selection Strategy

```typescript
// packages/epicenter/src/client/blob-upload.ts

import type { Awareness } from 'y-protocols/awareness';
import { tryAsync } from 'wellcrafted';
import { hashBlob } from '../core/blobs/hash';

/**
 * Upload blob to the best available server.
 *
 * Server selection priority:
 * 1. First server in awareness list that responds
 * 2. (Future: latency-based selection, sticky sessions)
 */
export async function uploadBlob(params: {
	awareness: Awareness;
	data: Blob | File;
}) {
	const { awareness, data } = params;

	// 1. Hash the blob
	const hash = await hashBlob(data);

	// 2. Get available servers
	const servers = getServerUrlsFromAwareness(awareness);
	if (servers.length === 0) {
		return { ok: false, error: { message: 'No servers available' } };
	}

	// 3. Try servers in order until one succeeds
	for (const serverUrl of servers) {
		const result = await tryAsync(
			async () => {
				const response = await fetch(`${serverUrl}/blobs/${hash}`, {
					method: 'PUT',
					body: data,
				});

				if (response.status === 201 || response.status === 200) {
					return { hash, serverUrl };
				}

				return null;
			},
			(error) => ({ message: `Failed to upload to ${serverUrl}`, cause: error }),
		);

		if (result.ok && result.value) {
			console.log(`[Blob] Uploaded ${hash} to ${serverUrl}`);
			return { ok: true, value: result.value };
		}
	}

	return { ok: false, error: { message: 'All servers failed' } };
}

function getServerUrlsFromAwareness(awareness: Awareness): string[] {
	const urls: string[] = [];
	for (const [, state] of awareness.getStates()) {
		if (state.blobs?.type === 'server') {
			urls.push(state.blobs.url);
		}
	}
	return urls;
}
```

### Upload Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT UPLOAD FLOW                          │
└─────────────────────────────────────────────────────────────────┘

User selects file
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Hash file (SHA-256)                                          │
│    const hash = await hashBlob(file);                           │
│    // → "sha256-abc123..."                                      │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. Get servers from awareness                                   │
│    ['http://laptop:3913', 'http://desktop:3913']                │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. Upload to first server                                       │
│    PUT http://laptop:3913/blobs/sha256-abc123                   │
│    Body: <file data>                                            │
│                                                                 │
│    Server verifies hash, stores blob, returns 201               │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Store hash in CRDT                                           │
│    client.blog.tables.posts.upsert({                            │
│      id: 'post_123',                                            │
│      coverImage: hash,  // Just the hash string!                │
│    });                                                          │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. UI renders                                                   │
│    <img src="/blobs/sha256-abc123">                             │
│    Service Worker handles fetch → cache → display               │
└─────────────────────────────────────────────────────────────────┘

Meanwhile, servers sync via HTTP polling (30s interval)
```

---

## Complete Sync Flow with Discovery

```
┌─────────────────────────────────────────────────────────────────┐
│     COMPLETE BLOB LIFECYCLE (SIMPLIFIED ARCHITECTURE)            │
└─────────────────────────────────────────────────────────────────┘

T=0: Phone connects to laptop server (ONLY manual config needed)
────────────────────────────────────────────────────────────────────
Phone: WebSocket → ws://laptop.tailnet:3913/workspaces/blog/sync
       YJS sync protocol initializes
       Awareness syncs
       Service Worker registers


T=5ms: Awareness broadcasts server URLs (NO hash lists!)
─────────────────────────────────────────────────────────
Laptop server awareness:
{
  type: 'server',
  url: 'http://laptop.tailnet:3913'  // Just the URL!
}

Desktop server awareness:
{
  type: 'server',
  url: 'http://desktop.tailnet:3913'
}

Phone's Service Worker learns both server URLs via postMessage.


T=100ms: User uploads file on phone
────────────────────────────────────
const file = <user selects image.jpg>;

// Step 1: Hash the file
const hash = await hashBlob(file);
// → "sha256-xyz789..."

// Step 2: Upload to ONE server (first available)
PUT http://laptop.tailnet:3913/blobs/sha256-xyz789
Body: <file data>

// Step 3: Store hash in CRDT
client.blog.tables.posts.upsert({
  id: 'post_123',
  coverImage: hash,  // Just the hash string!
});

// That's it! No OPFS, no awareness updates needed.


T=105ms: UI renders immediately
────────────────────────────────
<img src="/blobs/sha256-xyz789">

Service Worker intercepts:
1. Cache MISS (first time)
2. GET http://laptop.tailnet:3913/blobs/sha256-xyz789 → 200
3. Cache response (immutable)
4. Return to UI

Image displays!


T=30s: Server-to-server sync (HTTP polling)
───────────────────────────────────────────
Desktop's sync loop wakes up:
1. GET http://laptop.tailnet:3913/blobs → { hashes: [..., 'sha256-xyz789'] }
2. Compares with local hashes: missing sha256-xyz789
3. GET http://laptop.tailnet:3913/blobs/sha256-xyz789
4. Stores to .epicenter/blobs/

Desktop now has the blob!


T=30s+: Other browser loads the page
─────────────────────────────────────
Other browser's Service Worker:
1. <img src="/blobs/sha256-xyz789">
2. Cache MISS
3. Try laptop → 200 (or desktop → 200)
4. Cache response
5. Display image

Works regardless of which server has the blob!


SUMMARY
───────
- No OPFS: Browser uses native HTTP cache
- No awareness hash lists: Just server URLs
- Upload once: To ONE server, servers sync among themselves
- Service Worker: Provides stable /blobs/:hash URLs
- HTTP polling: Servers sync every 30s via GET /blobs
```

---

## Client API

### Schema Definition

```typescript
// The blob() column type stores a hash string
// Optional validation on upload (mimeTypes, maxSize)

import { blob } from 'epicenter';

const workspace = defineWorkspace({
	id: 'blog',
	tables: {
		posts: {
			id: id(),
			title: text(),
			coverImage: blob({
				mimeTypes: ['image/*'], // Optional: validate mime type on upload
				maxSize: 10_000_000, // Optional: validate size on upload (10MB)
			}),
		},
	},
});
```

### Blob Operations (Simplified)

```typescript
// Upload: Hash + upload to server
const result = await client.blobs.upload(file);
if (result.ok) {
	const hash = result.value.hash;  // "sha256-a1b2c3d4..."
}

// What happens:
// 1. Hash the file (SHA-256)
// 2. Upload to first available server (PUT /blobs/:hash)
// 3. Return hash for storing in CRDT

// Display: Just use the hash in URL!
// NO client.blobs.get() needed - Service Worker handles it
<img src={`/blobs/${hash}`} />
```

### Key Simplification

| Old API | New API |
|---------|---------|
| `client.blobs.put(file)` → OPFS | `client.blobs.upload(file)` → server |
| `client.blobs.get(hash)` → Blob | Not needed! Use `/blobs/:hash` URL |
| `client.blobs.list()` → hashes | Not needed on client |
| `client.blobs.has(hash)` → boolean | Not needed on client |

**Why simpler**: Browser doesn't manage blobs; it just uploads and renders URLs.

### Usage Example

```typescript
// Upload an image
const imageFile = document.getElementById('fileInput').files[0];

// Upload to server (hash is computed automatically)
const result = await client.blobs.upload(imageFile);
if (!result.ok) {
	console.error('Upload failed:', result.error);
	return;
}

const hash = result.value.hash;
// → "sha256-abc123..."

// Store hash in CRDT
client.blog.tables.posts.upsert({
	id: 'post_123',
	title: 'My Post',
	coverImage: hash,  // Just the hash string!
});

// Display the image - Service Worker handles the rest
// <img src="/blobs/sha256-abc123">
```

### Svelte Component Example

```svelte
<script lang="ts">
	import { client } from '$lib/epicenter';

	let { post } = $props<{ post: Post }>();
</script>

{#if post.coverImage}
	<!-- Service Worker intercepts, checks cache, fetches from server if needed -->
	<img src={`/blobs/${post.coverImage}`} alt={post.title} />
{/if}
```

### Upload with Validation

```typescript
// Validation happens BEFORE upload
const result = await client.blobs.upload(file, {
	mimeTypes: ['image/jpeg', 'image/png'],
	maxSize: 5_000_000, // 5MB
});

if (!result.ok) {
	// result.error.context.code might be:
	// - 'INVALID_MIME_TYPE'
	// - 'FILE_TOO_LARGE'
	// - 'UPLOAD_FAILED'
}
```

---

## Validation

### blob() Column Type

```typescript
// packages/epicenter/src/core/schema/columns/blob.ts

export type BlobColumnOptions = {
	mimeTypes?: string[]; // e.g., ['image/*', 'application/pdf']
	maxSize?: number; // Max size in bytes
	nullable?: boolean;
};

export function blob(options: BlobColumnOptions = {}) {
	return {
		type: 'blob' as const,
		...options,
	};
}
```

### Validation on Put

```typescript
async function put(
	data: Blob | File,
	columnOptions?: BlobColumnOptions,
): Promise<Result<string, BlobError>> {
	// Validate mime type
	if (columnOptions?.mimeTypes) {
		const matches = columnOptions.mimeTypes.some((pattern) => {
			if (pattern.endsWith('/*')) {
				const prefix = pattern.slice(0, -1);
				return data.type.startsWith(prefix);
			}
			return data.type === pattern;
		});

		if (!matches) {
			return Err(
				BlobErr({
					message: `Invalid mime type: ${data.type}`,
					context: { code: 'INVALID_MIME_TYPE', mimeType: data.type },
				}),
			);
		}
	}

	// Validate size
	if (columnOptions?.maxSize && data.size > columnOptions.maxSize) {
		return Err(
			BlobErr({
				message: `File too large: ${data.size} > ${columnOptions.maxSize}`,
				context: {
					code: 'FILE_TOO_LARGE',
					size: data.size,
					maxSize: columnOptions.maxSize,
				},
			}),
		);
	}

	// Hash and store
	const hash = await hashAndStore(data);
	return Ok(hash);
}
```

---

## Size Recommendations

| Level                  | Max Size | Use Case                              |
| ---------------------- | -------- | ------------------------------------- |
| **Conservative**       | 5 MB     | Icons, screenshots, compressed images |
| **Moderate** (default) | 10 MB    | Photos, GIFs, small audio             |
| **Liberal**            | 25 MB    | High-res photos, large GIFs           |

**Default**: 10 MB covers most images and GIFs while staying Git-friendly.

For larger files (videos), store externally (S3, R2) and save URL in row.

---

## Deletion Strategy (Append-Only)

### V1: No True Delete

- `delete()` is either a no-op or removes from local storage only
- Blob references cleared from YJS rows, but blob data persists
- Similar to Git: deleting a file doesn't remove it from history

### Why Append-Only?

1. **Simpler sync**: No "delete from all devices" coordination
2. **Git-like**: Data persists, references change
3. **Safe**: Can't accidentally lose data
4. **GC later**: Add garbage collection in v2

### Future: Garbage Collection (v2)

```typescript
// Deferred to v2
async function gc() {
	const allHashes = await storage.list();
	const referencedHashes = findAllBlobRefsInAllTables();

	for (const hash of allHashes) {
		if (!referencedHashes.has(hash)) {
			await storage.delete(hash);
		}
	}
}
```

---

## Migration from Current Implementation

### Current State

- `packages/epicenter/src/core/blobs/` exists with basic implementation
- Uses filename-based keys, namespaced by table
- No content addressing
- Manual server configuration

### Migration Steps

1. [ ] Implement new `hashBlob()` function with `sha256-` prefix
2. [ ] Update storage to use hash-based keys
3. [ ] Remove table namespacing
4. [ ] Add awareness sync with discovery
5. [ ] Update client API
6. [ ] Add server HTTP endpoints (ElysiaJS)
7. [ ] Update blob() column type
8. [ ] Update documentation

### Breaking Changes

- Hash format: `sha256:` → `sha256-` (hyphen for Windows/S3 compat)
- Blob keys change from filenames to hashes
- API: `blobs.posts.put(filename, data)` → `blobs.put(data)`
- Existing blobs need migration (re-hash and store)

---

## File Structure

```
packages/epicenter/src/core/blobs/
├── index.ts              # Public API exports
├── types.ts              # BlobAwareness type (server URL only)
├── hash.ts               # SHA-256 hashing with sha256- prefix
├── storage.node.ts       # Server filesystem storage (Bun)
├── validation.ts         # MIME type and size validation
├── errors.ts             # Error types (BlobErr, etc.)
└── README.md             # Comprehensive documentation

packages/epicenter/src/client/
├── blob-upload.ts        # Client upload helper (hash + PUT to server)
├── blob-awareness.ts     # Server discovery from awareness
├── register-sw.ts        # Service Worker registration
└── ... (existing files)

packages/epicenter/src/server/
├── server.ts             # Main server setup
├── blobs.ts              # Blob HTTP routes (GET/PUT + range support)
├── blob-sync.ts          # Server-to-server HTTP polling sync
├── awareness-setup.ts    # Broadcast server URL in awareness
├── sync/index.ts         # WebSocket sync plugin
└── tables.ts             # Table CRUD routes

public/
└── epicenter-sw.js       # Service Worker for /blobs/:hash URLs
```

### Key Changes from Old Structure

| Removed | Why |
|---------|-----|
| `storage.browser.ts` | No OPFS; browser uses HTTP cache |
| `index.browser.ts` | No browser-specific storage exports |
| `sync.ts` (old) | No awareness-based hash sync |

| Added | Why |
|-------|-----|
| `epicenter-sw.js` | Service Worker for stable blob URLs |
| `blob-sync.ts` | Server-to-server HTTP polling |
| `blob-upload.ts` | Client upload to ONE server |

---

## Implementation Checklist

### Core Implementation

- [ ] `hash.ts` - SHA-256 with `sha256-` prefix
- [ ] `storage.node.ts` - Server filesystem storage (Bun)
- [ ] `validation.ts` - MIME type & size validation
- [ ] `types.ts` - BlobAwareness type (server URL only)
- [ ] `errors.ts` - BlobErr and error types

### Service Worker (Browser)

- [ ] `epicenter-sw.js` - Service Worker for `/blobs/:hash` interception
- [ ] Cache-first strategy with fallback to servers
- [ ] `postMessage` handler for server list updates
- [ ] `register-sw.ts` - SW registration helper

### Server Integration (ElysiaJS)

- [ ] `blobs.ts` - HTTP routes with range support
  - [ ] `GET /blobs/:hash` with Cache-Control + Range headers
  - [ ] `PUT /blobs/:hash` with hash verification
  - [ ] `GET /blobs` list endpoint for server-to-server sync
- [ ] `blob-sync.ts` - Server-to-server HTTP polling (30s)
- [ ] `awareness-setup.ts` - Broadcast server URL in awareness
- [ ] Integrate blob routes + sync into main server

### Client API

- [ ] `client.blobs.upload()` - Hash + upload to ONE server
- [ ] `setupServerDiscovery()` - Notify SW of server changes
- [ ] Integration with `createClient()` for auto SW registration

### Polish

- [ ] Write comprehensive README
- [ ] Write tests (unit + integration)
- [ ] Migration script for existing blobs (if any)

---

## Resolved Questions

### Hash Format

✅ **Decided**: `sha256-` (hyphen, not colon)

- Windows filesystem compatible
- S3/R2 object key compatible
- Future-proof for other algorithms

### Browser Storage

✅ **Decided**: Native HTTP caching (NOT OPFS)

- Browser cache handles storage automatically
- Cache-Control: immutable for content-addressed blobs
- No custom OPFS code to maintain
- Service Worker provides stable URLs

### Awareness State

✅ **Decided**: Server URLs only (NO hash lists)

- Awareness broadcasts only `{ type: 'server', url: '...' }`
- No blob hash lists in awareness (was O(peers × blobs))
- Minimal state, minimal bandwidth

### Server-to-Server Sync

✅ **Decided**: HTTP polling every 30s

- Servers poll `GET /blobs` from other servers
- Compare with local hashes, fetch missing
- Simple, stateless, uses existing endpoints
- No Syncthing (too heavy at 34MB)

### Client Upload Strategy

✅ **Decided**: Upload to ONE server

- Client picks first available server
- Servers sync among themselves via HTTP polling
- Simpler than uploading to all servers

### Range Requests

✅ **Decided**: Support for audio/video streaming

- `Accept-Ranges: bytes` header
- 206 Partial Content responses
- Enables seeking without full download

### ElysiaJS Patterns

✅ **Decided**: Use `status()` helper and `Err()` from wellcrafted

- `status(400, Err(error))` for error responses
- `set.headers` for response headers
- Better type safety and consistency

---

## Review

_To be filled after implementation_

---

## Appendix: YJS Awareness Research Findings

From official YJS implementation:

### Timing Constants

- **Timeout**: 30 seconds (peers marked offline if no update)
- **Auto-renewal**: 15 seconds (automatic state re-broadcast)
- **Check interval**: 3 seconds (cleanup and renewal check)

### Update Behavior

- **Immediate broadcast**: `setLocalStateField()` triggers instant WebSocket send
- **Built-in change detection**: Deep equality check prevents redundant updates
- **No rate limiting**: Each state change immediately broadcasts
- **Push-based**: No polling, pure event-driven

### Best Practices for Blob Storage

- Use `setLocalStateField('blobs', state)` for partial updates
- Keep data small (just server URL now!)
- Awareness is for discovery only, not sync coordination

This makes awareness perfect for server discovery: automatic, efficient, minimal state.
````
