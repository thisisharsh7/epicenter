# Database Service Architecture

## Overview

The database service provides a unified interface for storing and retrieving recordings across different platforms (web and desktop). Each platform uses its own optimal storage format, but both expose the same intermediate representation to the UI layer.

## Key Concepts

### Intermediate Representation vs Storage Format

**`Recording` type** - The intermediate representation used throughout the application:
- Unified interface for UI components
- Contains `blob: Blob | undefined` for audio data
- Same structure whether on desktop or web
- Defined in `models/recordings.ts`

**Storage formats** - How data is actually persisted:
- **Desktop**: Markdown files (.md) + separate audio files (.webm, .mp3)
- **Web**: IndexedDB with serialized audio (`RecordingStoredInIndexedDB`)

### The Pattern

```
Storage Layer          →    Service Layer    →    UI Layer
================            ==============        ==========
Desktop: .md + .webm   →                     →
                            Recording type    →    Components
Web: IndexedDB         →                     →
```

Each storage implementation:
1. Reads from its native format
2. Converts to `Recording` type
3. Returns to UI/service layer

## Desktop Storage (File System)

**Location**: `~/.whispering/recordings/` (or platform-specific app data)

**Format**:
```
recordings/
  abc123.md          ← Metadata (YAML frontmatter + transcribed text)
  abc123.webm        ← Audio file (same ID)
  def456.md
  def456.mp3
```

**Metadata file** (`abc123.md`):
```markdown
---
id: abc123
title: My Recording
subtitle: Quick note
timestamp: 2025-10-28T10:30:00Z
created_at: 2025-10-28T10:30:00Z
updated_at: 2025-10-28T10:35:00Z
transcription_status: DONE
---

This is the transcribed text content.
```

**Audio file**: Stored as separate file with same ID

**Implementation**: `file-system.ts`
- Uses `@tauri-apps/plugin-fs` for file operations
- Uses `gray-matter` to parse YAML frontmatter
- Converts snake_case (YAML) ↔ camelCase (TypeScript)
- Reads audio file and converts to Blob when returning Recording

## Web Storage (IndexedDB)

**Database**: `whispering-db`

**Format**: Single object store `recordings` with schema V5:
```typescript
{
  id: 'abc123',
  title: 'My Recording',
  subtitle: 'Quick note',
  timestamp: '2025-10-28T10:30:00Z',
  createdAt: '2025-10-28T10:30:00Z',
  updatedAt: '2025-10-28T10:35:00Z',
  transcribedText: 'This is the transcribed text...',
  transcriptionStatus: 'DONE',
  serializedAudio: {
    arrayBuffer: ArrayBuffer(...),
    blobType: 'audio/webm'
  }
}
```

**Why serializedAudio?** IndexedDB can't reliably store Blob objects across browsers, so we serialize to ArrayBuffer + mime type.

**Implementation**: `index-db.ts`
- Uses Dexie.js for IndexedDB operations
- Serializes blobs to `{ arrayBuffer, blobType }` when storing
- Deserializes back to Blob when reading

## Dual Read / Single Write (Desktop Only)

During the migration period (Phase 2), desktop uses a **dual read, single write** strategy:

**Read**: Check both sources
```typescript
async function getAll() {
  const fileSystemRecordings = await fileSystem.getAll();
  const indexedDBRecordings = await indexedDB.getAll();

  // Merge, preferring file system for duplicates
  return mergeDeduplicate([...fileSystemRecordings, ...indexedDBRecordings]);
}
```

**Write**: Only to file system
```typescript
async function create(recording) {
  // Write to file system only
  return fileSystem.create(recording);
}
```

This allows gradual migration without data loss.

## Service Interface

All implementations expose the same `DbService` interface:

```typescript
type DbService = {
  recordings: {
    getAll: () => Promise<Result<Recording[], DbServiceError>>;
    getById: (id: string) => Promise<Result<Recording | null, DbServiceError>>;
    create: (recording: Recording) => Promise<Result<Recording, DbServiceError>>;
    update: (recording: Recording) => Promise<Result<Recording, DbServiceError>>;
    delete: (id: string) => Promise<Result<void, DbServiceError>>;
  };
  // ... other stores
};
```

## File Organization

```
src/lib/services/db/
├── README.md              ← This file
├── index.ts               ← Platform-specific db factory
├── types.ts               ← DbService interface and error types
├── models/
│   └── recordings.ts      ← Recording type definitions
├── file-system.ts         ← Desktop implementation
├── index-db.ts            ← Web implementation
└── desktop.ts             ← Dual read/single write wrapper
```

## Usage Examples

### Creating a recording

```typescript
import { db } from '$lib/services/db';

const { data: recording, error } = await db.recordings.create({
  id: generateId(),
  title: 'My Recording',
  subtitle: 'Quick note',
  timestamp: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  blob: audioBlob, // From MediaRecorder
  transcribedText: '',
  transcriptionStatus: 'UNPROCESSED',
});
```

### Reading recordings

```typescript
const { data: recordings, error } = await db.recordings.getAll();

// Both platforms return the same Recording type
recordings.forEach(recording => {
  console.log(recording.title);

  // Blob is populated on both platforms
  if (recording.blob) {
    const url = URL.createObjectURL(recording.blob);
    // Use url in <audio> element
  }
});
```

## Migration Path

The long-term plan is to eventually use file system storage on both platforms:

1. **Phase 1** (✅ Complete): Web uses IndexedDB
2. **Phase 2** (🚧 Current): Desktop uses file system, dual read during migration
3. **Phase 3** (Future): Web uses File System Access API where supported
4. **Phase 4** (Future): Unified file system implementation across platforms

See `docs/specs/` for detailed migration plans.
