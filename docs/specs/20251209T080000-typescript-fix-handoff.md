# TypeScript Error Fix Plan

## Branch Status

**Branch:** `braden-w/fix-recording-restart`
**Base Commit:** `df0b6c44a` (merged with `origin/main` → `c2190b6bb`)
**Current HEAD:** `cccbe0d11`

## Completed Fixes (Previous Session)

### 1. OsService Type Fix (`f618b8b99`)
**File:** `apps/whispering/src/lib/services/os/types.ts`
**Change:** Expanded `OsService.type()` return type from `Exclude<OsType, 'android' | 'ios'>` to `OsType`
**Reason:** The service implementations (both desktop and web) can legitimately return mobile platform types

### 2. Uint8Array/ArrayBuffer Cast Fix (`8463e1c38` → `cccbe0d11`)
**Files:**
- `apps/whispering/src/lib/services/fs/desktop.ts`
- `apps/whispering/src/lib/services/recorder/cpal.ts`

**Changes:**
- Created `readFileWithMimeType()` helper with safe cast and JSDoc explaining why
- Created `createBlobFromPath()` and `createFileFromPath()` throwable helpers
- Refactored `cpal.ts` to use `FsServiceLive.pathToBlob()` instead of reimplementing
- Reorganized file with progressive disclosure (export at top, low-level helpers at bottom)
- Used `Promise.all` for parallel file processing in `pathsToFiles`

---

## Analysis of Remaining Errors

### Category 3: FFmpeg Recorder Issues (Wave 1)
**File:** `apps/whispering/src/lib/services/recorder/ffmpeg.ts`

| Line | Error | Root Cause | Proposed Fix |
|------|-------|-----------|--------------|
| 101 | TS1355 | `as const` on computed `.replace()` result | Remove `as const`; computed strings can't be const |
| 118-124, 142-148, 574-580 | TS7053 | Platform configs indexed with `OsType` but only have desktop keys | Create `DesktopPlatform` type and add runtime assertion |
| 553-571 | TS2532/TS2345/TS2322 | Regex match groups are `string \| undefined` | Add non-null assertions with safety comment |

**Note:** The platform config pattern appears 3 times (lines 118-124, 142-148, 574-580). All need the same fix.

### Category 5: Keyboard Shortcut Key Type Issues (Wave 2)
**File:** `src/lib/utils/createPressedKeys.svelte.ts`

**Root Cause:** Line 51 types `pressedKeys` as `KeyboardEventPossibleKey[]` but after the `isSupportedKey()` guard (line 78), only `KeyboardEventSupportedKey` values are stored.

**Fix:** Change type from `KeyboardEventPossibleKey[]` to `KeyboardEventSupportedKey[]`. This automatically fixes `create-key-recorder.svelte.ts:73-75`.

### Category 4: Settings Type Issues (Wave 3)
**File:** `src/lib/settings/settings.ts:165`

**Root Cause:** `FFMPEG_DEFAULT_INPUT_OPTIONS` is `string | undefined` because it indexes a 3-key object with `OsType` (5 possible values). After FFmpeg fix (Wave 1), this becomes `string`.

### Category 2: TransformationRun Array Type Issues (Wave 4)
**File:** `src/lib/query/transformer.ts` (lines 347, 367, 382, 398)

Need to investigate `services.db.runs.*` return types to understand array vs single item mismatch.

### Category 1: Svelte Module Export Issues (Wave 5)
**Files:** Various `.svelte` files with `<script module lang="ts">` exports

**Analysis:** The exports are correctly defined. TypeScript may not recognize Svelte module exports. Need to investigate tooling config.

---

## Proposed Fix Order

- [ ] **Wave 1:** FFmpeg recorder (Category 3)
  - [ ] Remove `as const` from line 101
  - [ ] Create `DesktopPlatform` type and assertion helper
  - [ ] Fix platform config indexing (3 locations)
  - [ ] Add non-null assertions for regex matches in `parseDevices`
- [ ] **Wave 2:** Keyboard shortcut (Category 5)
  - [ ] Change `pressedKeys` type in createPressedKeys.svelte.ts
- [ ] **Wave 3:** Settings (Category 4) - likely auto-fixes after Wave 1
- [ ] **Wave 4:** TransformationRun (Category 2) - needs investigation
- [ ] **Wave 5:** Svelte exports (Category 1) - may be config issue

---

## Wave 1 Fix Details

### Line 101: Remove `as const`
```typescript
// Before
export const FFMPEG_SMALLEST_COMPRESSION_OPTIONS =
	FFMPEG_DEFAULT_COMPRESSION_OPTIONS.replace('-b:a 32k', '-b:a 16k') as const;

// After
export const FFMPEG_SMALLEST_COMPRESSION_OPTIONS =
	FFMPEG_DEFAULT_COMPRESSION_OPTIONS.replace('-b:a 32k', '-b:a 16k');
```

### Platform Config Pattern (lines 118-124, 142-148, 574-580)
Create a type and assertion helper at top of file:

```typescript
/**
 * Desktop platforms supported by FFmpeg recording.
 * Mobile platforms (ios, android) are not supported as FFmpeg
 * command-line recording requires a desktop environment.
 */
type DesktopPlatform = 'macos' | 'windows' | 'linux';

/**
 * Asserts that the current platform is a desktop platform.
 * FFmpeg recording is only available on desktop (macOS, Windows, Linux).
 */
function assertDesktopPlatform(platform: OsType): asserts platform is DesktopPlatform {
	if (platform === 'ios' || platform === 'android') {
		throw new Error(`FFmpeg recording is not supported on ${platform}`);
	}
}
```

Then use more specific satisfies and guard:
```typescript
const platformConfig = {
	macos: '...',
	windows: '...',
	linux: '...',
} as const satisfies Record<DesktopPlatform, string>;

assertDesktopPlatform(PLATFORM_TYPE);
const config = platformConfig[PLATFORM_TYPE];
```

### parseDevices regex matches (lines 553-571)
Add non-null assertions with explanatory comment:

```typescript
// These capture groups are guaranteed to exist when the regex matches.
// The regexes are defined inline and always have 1-2 capture groups.
extractDevice: (match) => ({
	id: asDeviceIdentifier(match[1]!.trim()),
	label: match[2]!.trim(),
}),
```

---

## Important Context

### User Preferences
- Always ask for permission before committing
- Keep changes minimal and simple
- Use `type` instead of `interface`
- Progressive disclosure: exports at top, implementation details below

### Approach
Go wave by wave, asking for approval before each commit.

---

## Review

(To be filled after fixes are applied)
