# DB Service Architecture

This directory contains the database service implementation for Whispering. The service provides a unified interface for storing and retrieving recordings, transformations, and transformation runs across different platforms (web and desktop).

## Overview

The DB service uses different storage backends depending on the platform:

- **Web**: IndexedDB (browser-based storage)
- **Desktop**: File system (Phase 2 migration in progress)

## Phase 2: File System Storage for Desktop

Phase 2 implements file-based storage for desktop, where each database entity is stored as a markdown file with YAML front matter plus accompanying audio files for recordings.

### Migration Strategy

The desktop implementation uses a **dual read/single write pattern** to ensure safe, gradual migration from IndexedDB to file system:

- **READS**: Merge data from BOTH IndexedDB and file system (file system takes precedence)
- **WRITES**: Only write to file system (new data)
- **Old data**: Remains in IndexedDB until naturally migrated
- **Automatic migration**: When updating old data, it's automatically moved to file system

This ensures:
- ✅ No data loss during migration
- ✅ Gradual, automatic migration as users interact with data
- ✅ File system becomes the source of truth over time
- ✅ Users don't need to manually migrate anything

### File Structure

```
{APP_DATA}/whispering/
├── recordings/
│   ├── {id}.md              # Metadata (YAML front matter + transcribed text)
│   └── {id}.{ext}           # Audio file (.wav, .opus, .mp3, etc.)
├── transformations/
│   └── {id}.md              # Transformation configuration
└── transformation-runs/
    └── {id}.md              # Execution history
```

### Example: Recording File

**Metadata File**: `{APP_DATA}/whispering/recordings/abc123.md`

```markdown
---
id: abc123
title: "Morning Meeting Notes"
subtitle: "Team standup discussion"
timestamp: "2025-10-27T09:30:00.000Z"
createdAt: "2025-10-27T09:30:00.000Z"
updatedAt: "2025-10-27T09:35:00.000Z"
transcriptionStatus: DONE
---

# Transcribed Text

This is the transcribed content of the recording.
It can be multiple paragraphs.

The user can edit this directly in any text editor.
```

**Audio File**: `{APP_DATA}/whispering/recordings/abc123.wav`
- The actual audio data
- Format depends on recorder (wav, opus, mp3, etc.)
- No `audioFile` field needed in metadata; we automatically look for a file with matching ID and any audio extension

## Files

### Core Files

- **`types.ts`**: TypeScript interfaces and types for the DB service
- **`index.ts`**: Entry point that determines which implementation to use based on platform
- **`web.ts`**: IndexedDB implementation (used by web and desktop during migration)
- **`desktop.ts`**: Desktop wrapper with dual read/single write pattern
- **`file-system.ts`**: Pure file system implementation

### Model Files

- **`models/recordings.ts`**: Recording type and schema definitions
- **`models/transformations.ts`**: Transformation type definitions
- **`models/transformation-runs.ts`**: Transformation run type definitions

## Implementation Details

### File System Storage (`file-system.ts`)

The file system implementation uses:

- **gray-matter**: For parsing and serializing markdown with YAML front matter
- **@tauri-apps/plugin-fs**: For file system operations
- **Atomic writes**: Write to `.tmp` file first, then rename (prevents corruption)
- **Auto-discovery**: Audio files are automatically found by trying multiple extensions

Key features:

1. **Human-readable**: All metadata stored as markdown with YAML front matter
2. **Version control friendly**: Plain text diffs work great
3. **Searchable**: `grep`, Spotlight, etc. work out of the box
4. **Extensible**: Easy to add new fields
5. **Safe**: Atomic writes prevent file corruption

### Desktop Wrapper (`desktop.ts`)

The desktop wrapper implements the dual read/single write pattern:

**Read Operations**:
- Query both IndexedDB and file system in parallel
- Merge results with file system taking precedence
- Sort and deduplicate

**Write Operations**:
- New data: Write only to file system
- Updates: Write to file system (migrates from IndexedDB if needed)
- Deletes: Remove from both file system and IndexedDB

### Web Implementation (`web.ts`)

The web implementation uses Dexie (IndexedDB wrapper):

- Handles schema migrations
- Stores audio as ArrayBuffer
- Provides error recovery and database dumps
- Transaction support

## Usage

```typescript
import { rpc } from '$lib/query';

// Create a recording
const { data, error } = await rpc.db.recordings.create.execute({
  recording: {
    id: 'abc123',
    title: 'My Recording',
    // ... other fields
  }
});

// Get all recordings (automatically merges from both sources on desktop)
const { data: recordings, error } = await rpc.db.recordings.getAll.execute();

// Update a recording (automatically migrates to file system on desktop)
const { data, error } = await rpc.db.recordings.update.execute({
  recording: {
    id: 'abc123',
    title: 'Updated Title',
    // ... other fields
  }
});
```

## Benefits of File System Storage

1. **User control**: Users can directly edit files in any text editor
2. **Backup friendly**: Just copy the folder
3. **No size limits**: Unlike IndexedDB, no browser storage quotas
4. **Transparency**: Users can see exactly what's stored
5. **Performance**: Direct file access is faster than IndexedDB for large files
6. **Portability**: Easy to sync or move data between devices

## Migration Timeline

- **Phase 1** (Completed): Added PATHS constant and organized directory structure
- **Phase 2** (Current): File system implementation with dual read/single write
- **Phase 3** (Future): Optional tool to clean up old IndexedDB data

## Technical Decisions

### Why Markdown + YAML Front Matter?

1. **Standard**: Well-established pattern (Jekyll, Hugo, Obsidian, etc.)
2. **Human-readable**: Users can open and edit in any text editor
3. **Separation of concerns**: Metadata in front matter, content in body
4. **Tooling**: Excellent library support (gray-matter)

### Why No Separate Index File?

We opted for individual files per entity rather than a single index file because:

1. **Atomic operations**: Each file can be updated independently
2. **Conflict resolution**: Easier to handle concurrent updates
3. **Scalability**: No single file becomes a bottleneck
4. **Simplicity**: No need to keep index in sync with files

### Why No In-Memory Cache?

All queries scan files on demand (no caching layer). This is acceptable because:

- Desktop apps typically have < 1000 recordings
- File system reads are fast (< 1ms per file on SSD)
- Modern SSDs can easily handle hundreds of file reads per second
- Simpler implementation without cache invalidation complexity
- We can add in-memory caching or SQLite indexing in Phase 3 if needed

## Future Enhancements

Potential improvements for future phases:

1. **SQLite index**: For faster queries on large datasets
2. **File watchers**: Auto-reload when files change externally
3. **Backup/restore**: Built-in backup and restore functionality
4. **Sync**: Multi-device sync support
5. **Compression**: Optional compression for audio files
6. **Encryption**: Optional encryption for sensitive data
