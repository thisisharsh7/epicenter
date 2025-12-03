# PR #939 Merge Conflict Analysis

## Executive Summary

PR #939 cannot be merged cleanly into main due to conflicts arising from PRs #984 and #998 which were already merged. The conflicts are primarily architectural; both PR #939 and the merged PRs implement custom endpoint support, but with different approaches.

## Key Conflicts

### 1. Database Migration Conflict (`dexie.ts`)
- **Issue**: PR #939 modified `apps/whispering/src/lib/services/db/dexie.ts` to add a database migration (v0.5 → v0.6)
- **Problem**: This file was deleted in main as part of a refactoring (commit 7698839ed) that split the database service into platform-specific implementations (`desktop.ts`, `web.ts`, `file-system.ts`)
- **Resolution Required**: The database migration logic needs to be ported to the new architecture

### 2. Transformation Model Conflict (`transformations.ts`)
- **Issue**: Both PR #939 and main modified the `TransformationStep` type to add CustomEndpoint/Custom provider fields
- **PR #939 adds**:
  - `'prompt_transform.inference.provider.CustomEndpoint.model': string`
  - `'prompt_transform.inference.provider.CustomEndpoint.baseURL': string`
- **Main (via PR #984 + #998) has**:
  - Already includes Custom provider support through the factory pattern
  - Uses runtime `baseUrl` parameter instead of storing it in the transformation model
- **Resolution Required**: Decide on the data model; PR #998's approach is more elegant (baseUrl as runtime param) but requires different UI implementation

### 3. Completion Service Architecture Conflict

#### PR #939 Approach (`custom-endpoint.ts`)
- Creates a standalone service with custom error handling
- ~130 lines of code
- Stores `baseURL` in transformation model
- Hardcoded error message logic for each status code

#### Main Approach (PR #984 + #998: `custom.ts`)
- Uses `openai-compatible.ts` factory pattern
- ~27 lines of code (37% of original)
- Passes `baseUrl` as runtime parameter
- Configurable error handling and validation via factory config
- More maintainable and extensible

## PR Timeline and Relationships

1. **PR #939** (OPEN): Created by @vishesh-sachan
   - Adds CustomEndpoint provider
   - 1,296 additions, 21 deletions
   - Based on older codebase (before refactoring)

2. **PR #984** (MERGED): Created by @thurstonsand
   - Added Custom provider using factory pattern
   - Refactored OpenAI/OpenRouter to use shared factory
   - 404 additions, 354 deletions
   - Foundation for #998

3. **PR #998** (MERGED): Created by @braden-w
   - Built on #984
   - Further refactored to eliminate wrapper patterns
   - Moved baseUrl from config-time to runtime
   - Added comprehensive JSDoc documentation
   - 500 additions, 395 deletions

## What Each PR Does

### PR #939: CustomEndpoint
- **Provider Name**: "CustomEndpoint"
- **Storage**: Stores baseURL in transformation model (per-step configuration)
- **Implementation**: Standalone service with custom error handling
- **UI**: Configuration UI with examples (Ollama, LM Studio, llama.cpp)
- **API Key**: Stored globally in settings
- **Database**: Adds migration to support CustomEndpoint fields
- **Files Modified**: 10 files (includes new custom-endpoint.ts, migration, UI components)

### PR #984 + #998: Custom
- **Provider Name**: "Custom"
- **Storage**: baseUrl passed as runtime parameter (not stored in transformation)
- **Implementation**: Factory-based, shared with OpenAI/OpenRouter
- **Validation**: Config-based via `validateParams` function
- **Architecture**: Eliminates wrapper pattern, uses callbacks for behavior customization
- **Files Modified**: Refactored existing files to use factory pattern

## Technical Debt Comparison

| Aspect | PR #939 | Main (984 + 998) |
|--------|---------|------------------|
| Lines of code | 130 lines (custom-endpoint.ts) | 27 lines (custom.ts) |
| Code reuse | Custom implementation | Shared factory pattern |
| Maintainability | Lower (duplicated logic) | Higher (centralized) |
| Extensibility | Requires new file per provider | Just config changes |
| baseUrl handling | Stored in model | Runtime parameter |
| Error handling | Hardcoded per status | Configurable factory |

## Migration Path

To merge PR #939, the following changes are needed:

### Option A: Adapt PR #939 to Use Main's Architecture
1. **Remove** `custom-endpoint.ts`
2. **Keep** the UI components from #939 (Configuration.svelte, CustomEndpointApiKeyInput.svelte)
3. **Update** UI to work with main's Custom provider (pass baseUrl as parameter)
4. **Port** database migration logic to new architecture (desktop.ts/web.ts)
5. **Rename** provider references from "CustomEndpoint" to "Custom"
6. **Update** transformation model to remove baseURL storage (use runtime params instead)

### Option B: Keep PR #939's Implementation
1. **Revert** custom.ts from main
2. **Merge** #939's custom-endpoint.ts
3. **Update** openai-compatible.ts to not include Custom provider
4. **Port** database migration to new architecture
5. **Accept** the technical debt and code duplication

## Recommendation

**Option A is strongly recommended** because:
1. Main's architecture is cleaner and more maintainable (79% less code)
2. Factory pattern is already established and documented
3. Runtime baseUrl is more flexible than storing in model
4. Easier to add new OpenAI-compatible providers in the future
5. The UI components from #939 can still be used with minimal adaptation

## Files Requiring Attention

### High Priority (Must Fix)
1. `apps/whispering/src/lib/services/db/models/transformations.ts` - Merge conflict
2. `apps/whispering/src/lib/services/db/dexie.ts` - File deleted in main
3. `apps/whispering/src/lib/services/completion/custom-endpoint.ts` - Conflicts with custom.ts in main

### Medium Priority (Needs Review)
4. `apps/whispering/src/lib/components/transformations-editor/Configuration.svelte` - UI components from #939
5. `apps/whispering/src/lib/components/settings/api-key-inputs/CustomEndpointApiKeyInput.svelte` - New component from #939
6. `apps/whispering/src/lib/settings/settings.ts` - Settings schema changes
7. `apps/whispering/src/lib/query/transformer.ts` - Handler for CustomEndpoint

### Low Priority (Documentation)
8. `docs/guides/custom-endpoint-transformations.md` - New guide from #939

## Next Steps

1. **Discuss with @vishesh-sachan**: Explain the conflict and the two options
2. **Choose approach**: Option A (adapt to main) vs Option B (keep #939's impl)
3. **Create new branch**: Start fresh from main
4. **Port UI components**: Bring over the helpful UI from #939
5. **Update database migration**: Adapt to new architecture (desktop.ts/web.ts)
6. **Test thoroughly**: Ensure Custom provider works with both OpenAI SDK and local endpoints
7. **Update documentation**: Merge the helpful examples from #939's docs

## Credits

- **PR #939**: @vishesh-sachan - Excellent UI components and user-facing documentation
- **PR #984**: @thurstonsand - Foundation for factory pattern and Custom provider
- **PR #998**: @braden-w - Architecture consolidation and wrapper elimination
