# Blob Storage System

Epicenter's blob storage system provides a robust, local-first solution for storing and synchronizing binary data (images, documents, etc.) across devices. It uses content-addressed storage with SHA-256 hashes as identifiers, ensuring data integrity and efficient deduplication.

## Overview

- **Content-addressed**: Every blob is identified by the SHA-256 hash of its content. If two files have the same content, they share the same ID and are stored only once.
- **Flat storage**: Blobs are stored in a single global directory without table-level namespacing, maximizing deduplication across the entire workspace.
- **Isomorphic**: Seamlessly works in both browsers (using OPFS) and Node/Bun environments (using the local filesystem).
- **Awareness-based sync**: Device blob lists are broadcast via the Yjs awareness protocol, allowing peers to discover and fetch missing content opportunistically.
- **Append-only**: Optimized for simplicity and reliability; deletion synchronization is deferred to future versions.

## Architecture

The blob system operates across browser and server environments, utilizing the most efficient storage available for each platform.

```
Browser (OPFS)                        Server (Filesystem)
┌─────────────────┐                   ┌─────────────────┐
│ /blobs/         │                   │ .epicenter/     │
│   sha256:abc... │◄═══ Awareness ═══►│   blobs/        │
│   sha256:def... │    (hash lists)   │     sha256:abc..│
└─────────────────┘                   └─────────────────┘
        │                                     │
        └──────── HTTP GET/PUT ───────────────┘
              (fetch missing blobs)
```

## Key Concepts

### Content Addressing

Every blob ID is derived from its content using the SHA-256 algorithm.

- **Deduplication**: Identical files across different tables or records result in the same hash, saving storage space.
- **Integrity**: The hash doubles as a checksum. Clients can verify that the data received exactly matches the requested ID.

### Flat Storage

Unlike table data, blobs are not namespaced by table. All blobs live in a single `blobs/` directory. This allows a single image to be used as both a `posts.coverImage` and a `users.avatar` without redundant storage.

### Awareness-Based Sync

Peer-to-peer discovery happens via the Yjs awareness protocol:

1. Each client broadcasts a list of blob hashes they possess.
2. Clients compare their local storage against peer lists.
3. If a peer has a hash that the local client lacks, the client initiates a fetch.

### Awareness State

The sync state is communicated using the following structure:

```typescript
type BlobAwareness =
	| { type: 'browser'; blobHashes: string[] }
	| { type: 'server'; url: string; blobHashes: string[] };
```

## Schema Definition

Define blob columns in your workspace schema using the `blob()` helper.

```typescript
import { defineWorkspace, id, blob } from '@epicenter/hq';

const workspace = defineWorkspace({
	tables: {
		posts: {
			id: id(),
			coverImage: blob({
				mimeTypes: ['image/*'], // Optional validation
				maxSize: 10_000_000, // 10MB max (default)
			}),
		},
	},
});
```

### Configuration Options

| Option      | Type       | Default      | Description                                                                      |
| ----------- | ---------- | ------------ | -------------------------------------------------------------------------------- |
| `mimeTypes` | `string[]` | `undefined`  | Array of allowed MIME types or patterns (e.g., `['image/*', 'application/pdf']`) |
| `maxSize`   | `number`   | `10_000_000` | Maximum allowed size in bytes (10MB)                                             |

## API Reference

The blob system is accessible via the `client.blobs` API.

### `put(data: Blob | File | ArrayBuffer): Promise<string>`

Hashes and stores a blob locally. Returns the SHA-256 hash prefixed with `sha256:`. Storing a blob automatically triggers synchronization via the awareness protocol.

```typescript
const hash = await client.blobs.put(imageFile);
// Result: "sha256:a1b2c3d4..."
```

### `get(hash: string): Promise<Blob | null>`

Retrieves a blob from local storage. If the blob is missing locally but known to exist in the network, it will be automatically fetched before returning.

```typescript
const blob = await client.blobs.get('sha256:a1b2c3d4...');
```

### `list(): Promise<string[]>`

Returns an array of all blob hashes currently stored on the local device.

```typescript
const hashes = await client.blobs.list();
```

### `has(hash: string): Promise<boolean>`

Checks if a specific blob exists in local storage.

```typescript
const exists = await client.blobs.has('sha256:a1b2c3d4...');
```

## Practical Usage

### Storing and Retrieving

```typescript
// 1. Upload a file and get its content hash
const hash = await client.blobs.put(imageFile);

// 2. Store the hash in a table row
tables.posts.upsert({ id: 'p1', coverImage: hash });

// 3. Later, retrieve the hash from the row and get the actual data
const post = tables.posts.get({ id: 'p1' });
if (post.status === 'valid') {
	const image = await client.blobs.get(post.row.coverImage);
	const url = URL.createObjectURL(image);
}
```

## Sync Protocol

The synchronization flow ensures all clients eventually converge on the same set of blobs:

1. **Broadcast**: Each client periodically broadcasts their current blob hash list via awareness.
2. **Comparison**: When awareness updates, clients identify missing hashes.
3. **Fetching**:
   - Clients fetch missing blobs from servers using `HTTP GET /blobs/:hash`.
   - Browsers push unique local blobs to servers using `HTTP PUT /blobs/:hash`.
4. **Validation**: Servers verify that the content of a `PUT` request matches the hash in the URL before storing.
5. **Convergence**: Once stored, the new hash is added to the client's awareness broadcast, continuing the cycle until all peers are in sync.

### Server Endpoints

Servers expose the following endpoints for blob synchronization:

| Method | Endpoint       | Description                               |
| ------ | -------------- | ----------------------------------------- |
| `GET`  | `/blobs/:hash` | Download raw blob data                    |
| `PUT`  | `/blobs/:hash` | Store blob (server verifies hash matches) |
| `GET`  | `/blobs`       | List all hashes held by the server        |

## Limitations

### Append-Only Storage (v1)

The current version of the blob system is append-only:

- Deleting a reference to a blob in a table row does not remove the blob data from storage.
- Deletion synchronization across peers is complex and deferred to v2.
- Garbage collection mechanisms for orphaned blobs are planned for future releases.

### Size Recommendations

For optimal performance and sync reliability, follow these size guidelines:

| Category         | Max Size | Examples                                      |
| ---------------- | -------- | --------------------------------------------- |
| **Conservative** | 5 MB     | Icons, small screenshots, text documents      |
| **Moderate**     | 10 MB    | Standard photos, optimized GIFs (Recommended) |
| **Liberal**      | 25 MB    | High-resolution photos, large PDFs            |

**Note**: For very large files (videos, high-res archives), consider using external storage like S3 or R2 and storing the resulting URL in your table rows instead.

## Error Handling

The blob API returns standard `Result` types where appropriate. Common errors include:

- `HASH_MISMATCH`: The content provided during a `put` or server-side `PUT` does not match the expected hash.
- `STORAGE_FULL`: The local device or server has run out of storage space.
- `NOT_FOUND`: The requested hash does not exist in the network.
- `VALIDATION_FAILED`: The blob violates `maxSize` or `mimeTypes` constraints defined in the schema.
