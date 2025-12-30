# Blob Storage Redesign

**Created**: 2025-12-30  
**Status**: Planning  
**Author**: Braden + Claude

## Overview

Redesign the blob storage system to be simpler, content-addressed, and automatically synchronized via YJS awareness with automatic server discovery.

## Goals

1. **Simplicity**: Minimal API surface (`put`, `get`, `list`, `has`)
2. **Content-addressed**: SHA-256 hash as blob ID (deduplication, integrity)
3. **Flat storage**: No namespacing, blobs shared across all tables
4. **Automatic sync**: Awareness-based discovery and sync, no manual configuration
5. **Automatic discovery**: Connect to one server, discover all others via awareness
6. **Append-only**: No delete sync complexity (GC deferred to v2)
7. **Isomorphic**: Same API for browser (OPFS) and server (filesystem)

## Non-Goals (v1)

- Delta sync / chunking for large files
- Garbage collection (deferred to v2)
- Blob versioning
- Cloud storage integration (S3, R2) - will be v2 feature
- IndexedDB fallback (OPFS is standard in 2025)
- Encryption / Compression

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BLOB SYNC ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────────┘

  TWO SYNC CHANNELS (same WebSocket connection):

  ┌─────────────────────────────────────────────────────────────────┐
  │                                                                 │
  │   YJS SYNC (automatic)              BLOB SYNC (automatic)       │
  │   ────────────────────              ─────────────────────       │
  │   • Document state                  • Awareness broadcasts      │
  │   • Row data + blob refs            • Hash list comparison      │
  │   • CRDT merging                    • HTTP GET/PUT transfer     │
  │                                     • Server auto-discovery     │
  │                                                                 │
  └─────────────────────────────────────────────────────────────────┘

  STORAGE:

  Browser (OPFS)                        Server (Filesystem)
  ┌─────────────────┐                   ┌─────────────────┐
  │ /blobs/         │                   │ .epicenter/     │
  │   sha256-abc... │                   │   blobs/        │
  │   sha256-def... │                   │     sha256-abc..│
  └─────────────────┘                   └─────────────────┘
```

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
export async function hashBlob(data: Blob | File | ArrayBuffer): Promise<string> {
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

### Flat Structure

All blobs stored in single directory, keyed by hash:

```
# Browser (OPFS)
/blobs/
  sha256-a1b2c3d4...
  sha256-e5f6g7h8...

# Server (Filesystem)
.epicenter/blobs/
  sha256-a1b2c3d4...
  sha256-e5f6g7h8...
```

### No Namespacing

Blobs are NOT namespaced by table or column. The same image used in `posts.coverImage` and `users.avatar` is stored once.

### Browser Implementation (OPFS)

```typescript
// packages/epicenter/src/core/blobs/storage.browser.ts

import { hashBlob } from './hash';

const BLOBS_DIR = 'blobs';

async function getBlobsDir(): Promise<FileSystemDirectoryHandle> {
	const root = await navigator.storage.getDirectory();
	return root.getDirectoryHandle(BLOBS_DIR, { create: true });
}

export const blobStorage = {
	async put(data: Blob | File | ArrayBuffer): Promise<string> {
		const hash = await hashBlob(data);
		const dir = await getBlobsDir();
		const file = await dir.getFileHandle(hash, { create: true });
		const writable = await file.createWritable();
		await writable.write(data);
		await writable.close();
		return hash;
	},

	async get(hash: string): Promise<Blob | null> {
		try {
			const dir = await getBlobsDir();
			const file = await dir.getFileHandle(hash);
			return await file.getFile();
		} catch {
			return null; // Not found
		}
	},

	async has(hash: string): Promise<boolean> {
		try {
			const dir = await getBlobsDir();
			await dir.getFileHandle(hash);
			return true;
		} catch {
			return false;
		}
	},

	async list(): Promise<string[]> {
		const dir = await getBlobsDir();
		const hashes: string[] = [];
		for await (const [name] of dir.entries()) {
			if (name.startsWith('sha256-')) {
				hashes.push(name);
			}
		}
		return hashes;
	},

	async delete(hash: string): Promise<void> {
		try {
			const dir = await getBlobsDir();
			await dir.removeEntry(hash);
		} catch {
			// Ignore if not found
		}
	},
};
```

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


STEP 2: Awareness broadcasts server URLs
─────────────────────────────────────────
Laptop server awareness state:
{
  type: 'server',
  url: 'http://laptop.tailnet.ts.net:3913',  ← HTTP for blob transfers
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
Phone                     Laptop Server              Desktop Server
─────                     ─────────────              ──────────────

Connect WebSocket ────→   Receives connection
                          Sends awareness:
                          { url: 'http://laptop...',
                            blobHashes: [...] }
                          
Receives awareness   ←────
Discovers: laptop
                          Desktop is also connected:
Receives awareness   ←──────────────────────────── { url: 'http://desktop...',
Discovers: desktop                                   blobHashes: [...] }

Now knows both servers!
Can GET/PUT to either.
```

---

## Awareness-Based Sync

### Awareness State Type

```typescript
// packages/epicenter/src/core/blobs/types.ts

/**
 * Awareness state for blob synchronization.
 * 
 * Each peer broadcasts this state via YJS awareness protocol.
 * The `url` field enables automatic server discovery.
 */
type BlobAwareness =
	| {
			type: 'browser';
			blobHashes: string[]; // All hashes this browser has locally (OPFS)
	  }
	| {
			type: 'server';
			url: string; // HTTP URL for blob GET/PUT (e.g., 'http://laptop.tailnet:3913')
			blobHashes: string[]; // All hashes this server has (.epicenter/blobs/)
	  };
```

**Important distinction**:
- `url` is for **HTTP blob transfers** (GET/PUT requests)
- WebSocket sync happens separately (already connected)
- Browsers don't have `url` because they can't serve HTTP

### Sync Protocol

```
1. BROADCAST: Each peer broadcasts their blob hashes via awareness
   ────────────────────────────────────────────────────────────────

   Browser: { type: 'browser', blobHashes: ['sha256-aaa', 'sha256-bbb'] }
   Server:  { type: 'server', url: 'http://server:3913', blobHashes: ['sha256-aaa', 'sha256-ccc'] }

2. COMPARE: Each peer compares their hashes with others
   ────────────────────────────────────────────────────

   Browser missing: sha256-ccc (server has it)
   Server missing:  sha256-bbb (browser has it)

3. FETCH: Pull missing blobs from servers (browsers + servers can do this)
   ────────────────────────────────────────────────────────────────────────

   Browser: GET http://server:3913/blobs/sha256-ccc → store locally in OPFS
   Desktop Server: GET http://laptop:3913/blobs/sha256-xyz → store locally

4. PUSH: Browsers push their unique blobs to servers (browsers can't serve HTTP)
   ──────────────────────────────────────────────────────────────────────────────

   Browser: PUT http://server:3913/blobs/sha256-bbb (with blob as body)

5. UPDATE: After storing, update own awareness state
   ─────────────────────────────────────────────────

   Browser: { type: 'browser', blobHashes: ['sha256-aaa', 'sha256-bbb', 'sha256-ccc'] }
   Server:  { type: 'server', url: '...', blobHashes: ['sha256-aaa', 'sha256-bbb', 'sha256-ccc'] }

6. CONVERGE: All peers eventually have all blobs
   ──────────────────────────────────────────────

   YJS awareness ensures eventual convergence via automatic re-broadcasting
```

### Sync Timing

**No debouncing needed** for blob hash list updates:

- Blob uploads are low-frequency (unlike mouse cursors at 60fps)
- YJS awareness has built-in change detection (deep equality check)
- Awareness auto-renews every 15 seconds as heartbeat
- Each upload = 1 awareness update = totally fine

**Evidence from YJS research**:
- Awareness immediately broadcasts on `setLocalStateField()`
- Built-in deep equality prevents redundant `change` events
- Updates are push-based (no polling)

### Sync Implementation

```typescript
// packages/epicenter/src/core/blobs/sync.ts

import type { Awareness } from 'y-protocols/awareness';
import type { BlobStorage, BlobAwareness } from './types';

/**
 * Create blob sync using YJS awareness protocol.
 * 
 * This handles:
 * - Broadcasting local blob list via awareness
 * - Detecting missing blobs from other peers
 * - Fetching missing blobs from servers (GET)
 * - Pushing unique blobs to servers (PUT, browsers only)
 * - Automatic server discovery via awareness
 */
export function createBlobSync(params: {
	awareness: Awareness;
	storage: BlobStorage;
	localState: BlobAwareness;
}) {
	const { awareness, storage, localState } = params;

	// Set initial awareness state
	awareness.setLocalStateField('blobs', localState);

	// Listen for awareness changes (fires on any peer update)
	awareness.on('change', async () => {
		const states = awareness.getStates();
		const myHashes = new Set(await storage.list());

		// Build map: hash → server URLs that have it
		const serversByHash = new Map<string, string[]>();
		
		for (const [, state] of states) {
			const blobState = state.blobs as BlobAwareness | undefined;
			if (!blobState) continue;

			for (const hash of blobState.blobHashes) {
				if (blobState.type === 'server') {
					const servers = serversByHash.get(hash) || [];
					servers.push(blobState.url);
					serversByHash.set(hash, servers);
				}
			}
		}

		// Find hashes we're missing
		const allHashes = new Set(serversByHash.keys());
		const missing = [...allHashes].filter((h) => !myHashes.has(h));

		// Fetch missing blobs from servers (works for browsers AND servers)
		for (const hash of missing) {
			const servers = serversByHash.get(hash);
			if (servers && servers.length > 0) {
				await fetchAndStore(servers[0], hash);
			}
		}

		// If browser, push unique blobs to servers
		// (Servers don't need to push; other servers can pull from them)
		if (localState.type === 'browser') {
			const serverUrls = getServerUrls(states);
			const uniqueToMe = [...myHashes].filter((h) => !serversByHash.has(h));

			for (const hash of uniqueToMe) {
				for (const serverUrl of serverUrls) {
					await pushToServer(serverUrl, hash);
				}
			}
		}
	});

	async function fetchAndStore(serverUrl: string, hash: string) {
		try {
			const response = await fetch(`${serverUrl}/blobs/${hash}`);
			if (response.ok) {
				const blob = await response.blob();
				await storage.put(blob); // Stores locally + verifies hash
				await updateLocalHashes();
			}
		} catch (error) {
			console.warn(`Failed to fetch blob ${hash} from ${serverUrl}:`, error);
		}
	}

	async function pushToServer(serverUrl: string, hash: string) {
		try {
			const blob = await storage.get(hash);
			if (blob) {
				await fetch(`${serverUrl}/blobs/${hash}`, {
					method: 'PUT',
					body: blob,
				});
			}
		} catch (error) {
			console.warn(`Failed to push blob ${hash} to ${serverUrl}:`, error);
		}
	}

	async function updateLocalHashes() {
		const hashes = await storage.list();
		localState.blobHashes = hashes;
		awareness.setLocalStateField('blobs', localState);
	}

	function getServerUrls(states: Map<number, any>): string[] {
		const urls: string[] = [];
		for (const [, state] of states) {
			if (state.blobs?.type === 'server') {
				urls.push(state.blobs.url);
			}
		}
		return urls;
	}
}
```

---

## Server HTTP Endpoints (ElysiaJS)

```typescript
// packages/epicenter/src/server/blobs.ts

import { Elysia } from 'elysia';
import { Err, Ok } from 'wellcrafted/result';
import type { BlobStorage } from '../core/blobs/types';
import { hashBlob } from '../core/blobs/hash';
import { BlobErr } from '../core/blobs/errors';

/**
 * Create blob storage HTTP routes for ElysiaJS.
 * 
 * Endpoints:
 * - GET  /blobs/:hash  - Retrieve blob by hash
 * - PUT  /blobs/:hash  - Store blob (with hash verification)
 * - GET  /blobs        - List all hashes (debugging)
 */
export function createBlobRoutes(storage: BlobStorage) {
	const app = new Elysia({ prefix: '/blobs' });

	// GET /blobs/:hash - Retrieve blob
	app.get('/:hash', async ({ params: { hash }, status }) => {
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

		// Return blob directly (ElysiaJS handles Blob type)
		return blob;
	});

	// PUT /blobs/:hash - Store blob (verifies hash)
	app.put('/:hash', async ({ params: { hash }, body, status }) => {
		const expectedHash = hash;

		if (!expectedHash.startsWith('sha256-')) {
			return status(400, Err(BlobErr({
				message: 'Invalid hash format',
				context: { code: 'INVALID_HASH_FORMAT', hash: expectedHash },
			})));
		}

		// Body is automatically parsed as Blob for binary content
		const blob = body as Blob;
		const actualHash = await hashBlob(blob);

		if (actualHash !== expectedHash) {
			// Log to console for debugging (Option B from discussion)
			console.warn(
				`Hash mismatch: expected ${expectedHash}, got ${actualHash}`
			);
			
			return status(400, Err(BlobErr({
				message: 'Hash mismatch',
				context: {
					code: 'HASH_MISMATCH',
					expected: expectedHash,
					actual: actualHash,
				},
			})));
		}

		await storage.put(blob);
		
		return status(201, Ok({ hash: actualHash }));
	});

	// GET /blobs - List all hashes (debugging/full sync)
	app.get('/', async () => {
		const hashes = await storage.list();
		return Ok({ hashes });
	});

	return app;
}
```

### Integration with Main Server

```typescript
// packages/epicenter/src/server/server.ts

import { Elysia } from 'elysia';
import { createBlobRoutes } from './blobs';
import { createBlobStorage } from '../core/blobs';

export function createServer(client) {
	const app = new Elysia()
		.use(createSyncPlugin({ ... }))
		.use(createTablesPlugin({ ... }))
		.use(createBlobRoutes(createBlobStorage())) // ← Add blob routes
		.get('/', () => ({
			name: 'Epicenter API',
			version: '1.0.0',
			docs: '/openapi',
		}));

	// ... rest of server setup
}
```

### ElysiaJS Status Helper

**Key learnings**:
- Use `status()` helper function, NOT `set.status` property
- Access via context destructuring: `({ status }) => ...`
- Signature: `status(code, response?)` where code is number or string
- Returns `ElysiaCustomStatusResponse` which framework handles
- Better type safety than `set.status` approach

**Correct pattern**:
```typescript
// ✅ CORRECT: Use status() helper
({ status }) => {
  if (error) {
    return status(400, Err(error))
  }
  return Ok(data)
}

// ❌ INCORRECT: Don't use set.status
({ set }) => {
  set.status = 400
  return { error }
}
```

---

## Complete Sync Flow with Discovery

```typescript
┌─────────────────────────────────────────────────────────────────┐
│        COMPLETE BLOB LIFECYCLE WITH AUTO-DISCOVERY               │
└─────────────────────────────────────────────────────────────────┘

T=0: Phone connects to laptop server (ONLY manual config needed)
────────────────────────────────────────────────────────────────────
Phone: WebSocket → ws://laptop.tailnet:3913/workspaces/blog/sync
       YJS sync protocol initializes
       Awareness syncs


T=5ms: Awareness broadcasts (ALL peers)
───────────────────────────────────────
Laptop server:
{
  type: 'server',
  url: 'http://laptop.tailnet:3913',
  blobHashes: ['sha256-abc', 'sha256-def']
}

Desktop server (also connected to laptop via WebSocket):
{
  type: 'server',
  url: 'http://desktop.tailnet:3913',
  blobHashes: ['sha256-ghi', 'sha256-jkl']
}

Phone receives BOTH awareness states automatically!


T=10ms: Phone discovers all servers
────────────────────────────────────
Phone's awareness listener:
const servers = [];
for (const [, state] of awareness.getStates()) {
  if (state.blobs?.type === 'server') {
    servers.push(state.blobs.url);
  }
}
// servers = [
//   'http://laptop.tailnet:3913',
//   'http://desktop.tailnet:3913'
// ]

Discovery complete! No manual config beyond first connection!


T=100ms: User uploads file on phone
────────────────────────────────────
const file = <user selects image.jpg>;

// Step 1: Hash immediately
const hash = await hashBlob(file);
// → "sha256-xyz789..."

// Step 2: Store in OPFS immediately
await storage.put(file);  // Uses hash as filename

// Step 3: Update Y.Doc row reference
client.blog.tables.posts.upsert({
  id: 'post_123',
  coverImage: hash,  // Just the hash string!
});

// Step 4: Update awareness
awareness.setLocalStateField('blobs', {
  type: 'browser',
  blobHashes: ['sha256-xyz789']
});


T=105ms: Servers detect new blob
─────────────────────────────────
Laptop server awareness listener fires:
- Sees phone has sha256-xyz789
- Laptop doesn't have it
- But laptop can't pull from phone (phone can't serve HTTP)

Phone awareness listener fires:
- Sees laptop server needs sha256-xyz789
- Phone has it locally (in OPFS)
- Phone must push to laptop!


T=150ms: Phone pushes to laptop
────────────────────────────────
PUT http://laptop.tailnet:3913/blobs/sha256-xyz789
Body: <blob data>

Laptop receives, verifies hash matches, stores to disk
Laptop updates awareness:
{
  type: 'server',
  url: 'http://laptop.tailnet:3913',
  blobHashes: ['sha256-abc', 'sha256-def', 'sha256-xyz789']
}


T=155ms: Desktop pulls from laptop (server-to-server)
──────────────────────────────────────────────────────
Desktop awareness listener fires:
- Sees laptop has sha256-xyz789
- Desktop doesn't have it
- Desktop CAN pull from laptop (both are servers!)

GET http://laptop.tailnet:3913/blobs/sha256-xyz789

Desktop stores, updates awareness:
{
  type: 'server',
  url: 'http://desktop.tailnet:3913',
  blobHashes: ['sha256-ghi', 'sha256-jkl', 'sha256-xyz789']
}


T=200ms: Convergence achieved
──────────────────────────────
All peers have sha256-xyz789:
✓ Phone (OPFS)
✓ Laptop (.epicenter/blobs/)
✓ Desktop (.epicenter/blobs/)

Total sync time: ~200ms
Configuration required: ONE WebSocket URL
Servers discovered: Automatic via awareness
```

---

## Client API

### Schema Definition

```typescript
// The blob() column type provides validation hints
// The column stores a string (the hash)

import { blob } from 'epicenter';

const workspace = defineWorkspace({
	id: 'blog',
	tables: {
		posts: {
			id: id(),
			title: text(),
			coverImage: blob({
				mimeTypes: ['image/*'], // Optional: validate mime type on put
				maxSize: 10_000_000, // Optional: validate size on put (10MB)
			}),
		},
	},
});
```

### Blob Operations

```typescript
// Put: Hash + store locally + update awareness
// Hash is computed on the client BEFORE storing
const hash = await client.blobs.put(file);
// Returns: "sha256-a1b2c3d4..."
// Side effects:
// 1. Hashes the file (SHA-256)
// 2. Stores in OPFS (browser) or filesystem (server)
// 3. Updates awareness with new hash in list
// 4. Returns hash for storing in Y.Doc row

// Get: Retrieve from local storage
const blob = await client.blobs.get(hash);
// Returns: Blob | null
// Auto-fetched via awareness if missing locally

// List: All local blob hashes
const hashes = await client.blobs.list();
// Returns: string[]

// Has: Check if blob exists locally
const exists = await client.blobs.has(hash);
// Returns: boolean
```

### Usage Example

```typescript
// Upload an image
const imageFile = document.getElementById('fileInput').files[0];

// Hash and store locally (browser hashes FIRST!)
const hash = await client.blobs.put(imageFile);
// At this point:
// - Blob is in OPFS with filename sha256-abc...
// - Awareness has been updated
// - Other peers will sync automatically

// Store reference in Y.Doc
client.blog.tables.posts.upsert({
	id: 'post_123',
	title: 'My Post',
	coverImage: hash,  // Just the hash string
});

// Later, retrieve the image
const post = client.blog.tables.posts.get({ id: 'post_123' });
if (post.coverImage) {
	const imageBlob = await client.blobs.get(post.coverImage);
	if (imageBlob) {
		const url = URL.createObjectURL(imageBlob);
		// Use url in <img src={url}>
	}
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
			return Err(BlobErr({
				message: `Invalid mime type: ${data.type}`,
				context: { code: 'INVALID_MIME_TYPE', mimeType: data.type },
			}));
		}
	}

	// Validate size
	if (columnOptions?.maxSize && data.size > columnOptions.maxSize) {
		return Err(BlobErr({
			message: `File too large: ${data.size} > ${columnOptions.maxSize}`,
			context: {
				code: 'FILE_TOO_LARGE',
				size: data.size,
				maxSize: columnOptions.maxSize,
			},
		}));
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
├── index.browser.ts      # Browser-specific exports (OPFS)
├── index.node.ts         # Node/Bun-specific exports
├── types.ts              # Type definitions (BlobAwareness, etc.)
├── hash.ts               # SHA-256 hashing with sha256- prefix
├── storage.browser.ts    # OPFS storage implementation
├── storage.node.ts       # Filesystem storage implementation
├── sync.ts               # Awareness-based sync with discovery
├── validation.ts         # MIME type and size validation
├── errors.ts             # Error types (BlobErr, etc.)
└── README.md             # Comprehensive documentation

packages/epicenter/src/server/
├── server.ts             # Main server setup
├── blobs.ts              # Blob HTTP routes (ElysiaJS, NEW)
├── sync/index.ts         # WebSocket sync plugin
└── tables.ts             # Table CRUD routes
```

---

## Implementation Checklist

### Core Implementation
- [ ] `hash.ts` - SHA-256 with `sha256-` prefix
- [ ] `storage.browser.ts` - OPFS implementation
- [ ] `storage.node.ts` - Bun filesystem implementation
- [ ] `sync.ts` - Awareness-based sync with discovery
- [ ] `validation.ts` - MIME type & size validation
- [ ] `types.ts` - Updated BlobAwareness type
- [ ] `errors.ts` - BlobErr and error types

### Server Integration (ElysiaJS)
- [ ] `blobs.ts` - HTTP routes (GET/PUT /blobs/:hash)
- [ ] Integrate blob routes into main server
- [ ] Server awareness setup (broadcast URL in awareness)
- [ ] Use `status()` helper instead of `set.status`
- [ ] Use `Err()` from wellcrafted for error responses

### Client API
- [ ] `client.blobs.put()` - Hash + store + update awareness
- [ ] `client.blobs.get()` - Retrieve from local storage
- [ ] `client.blobs.list()` - List all local hashes
- [ ] `client.blobs.has()` - Check if hash exists

### Polish
- [ ] Write comprehensive README
- [ ] Write tests (unit + integration)
- [ ] Migration script for existing blobs
- [ ] Update documentation

---

## Resolved Questions

### Hash Format
✅ **Decided**: `sha256-` (hyphen, not colon)
- Windows filesystem compatible
- S3/R2 object key compatible
- Future-proof for other algorithms

### Discovery Mechanism
✅ **Decided**: Awareness-based discovery
- User configures ONE WebSocket URL
- Servers broadcast their HTTP URLs in awareness
- Clients auto-discover all servers
- No manual server list configuration

### Sync Timing
✅ **Decided**: Immediate awareness updates (no debouncing)
- Blob uploads are low-frequency
- YJS has built-in change detection
- No performance issues expected

### Server-to-Server Sync
✅ **Decided**: Yes, servers pull from other servers
- More resilient network topology
- Faster convergence
- Same implementation as browser pulling

### Hash Verification on PUT
✅ **Decided**: Log to console (Option B)
- Simple debugging without overengineering
- No metrics tracking in v1
- Can add monitoring later if needed

### Browser Hashing
✅ **Decided**: Browser hashes BEFORE storing locally
- Enables immediate local storage (no server roundtrip)
- Browser knows hash to reference in Y.Doc
- Server verifies on PUT for integrity
- Deduplication works automatically

### Collision Handling
✅ **Decided**: Don't worry about it
- SHA-256 collisions are virtually impossible
- Not worth the complexity in v1

### ElysiaJS Patterns
✅ **Decided**: Use `status()` helper and `Err()` from wellcrafted
- Correct: `status(400, Err(error))`
- Incorrect: `set.status = 400; return { error }`
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
- Keep data small (hash list is minimal)
- No debouncing needed for low-frequency updates (blob uploads)
- Awareness automatically handles reconnection and state re-sync

This makes awareness perfect for blob synchronization: automatic, efficient, and requiring zero additional infrastructure.
