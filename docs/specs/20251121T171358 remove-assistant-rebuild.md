# Epicenter Assistant Removal and Rebuild Plan

**Created:** 2025-11-21T17:13:58
**Status:** Planning

## Context

The CORS support PR (sst/opencode#1218) that Epicenter Assistant was waiting for has already been merged to the OpenCode main branch in a simpler implementation. The OpenCode team implemented CORS using Hono's built-in middleware with permissive defaults, making our configurable approach unnecessary.

Since the Assistant is still unstable and we want to rebuild it properly, this plan outlines a two-phase approach:
1. Update documentation and remove the Assistant package from main
2. Rebuild the Assistant on a dedicated feature branch

## Goals

1. Remove references to waiting on the CORS PR (it's already merged)
2. Clean up the main branch by removing the incomplete Assistant package
3. Set up clear communication about the Assistant being rebuilt
4. Create a clean slate for rebuilding the Assistant properly

## Two-Phase Approach

### Phase 1: Documentation Update and Package Removal

This phase involves two separate pull requests to keep changes focused and reviewable.

#### PR #1: Update README - Remove CORS Wait Message

**Branch:** `update-cors-readme` (current branch)

**Changes:**
- [x] Update README.md line 85-86 to remove "(currently unstable, waiting for this PR in OpenCode to merge)"
- [x] Update the Assistant description to indicate it's being rebuilt
- [x] Add note directing users to the rebuild branch (once created in Phase 2)
- [x] Keep the link to `apps/sh` for now since we haven't deleted it yet

**New text for lines 83-89:**
```markdown
<h3>🤖 <a href="https://github.com/epicenter-md/epicenter/tree/main/apps/sh">Epicenter Assistant</a></h3>
<p><em>Currently being rebuilt from the ground up.</em></p>
<p>A local-first assistant you can chat with. It lives in your folder, becoming the access point to everything you've ever written, thought, or built.</p>
<p><strong>→ Track rebuild progress on the <a href="https://github.com/epicenter-md/epicenter/tree/rebuild-assistant">rebuild-assistant branch</a></strong></p>
```

#### PR #2: Remove Assistant Package

**Branch:** `remove-assistant-package`

**Changes:**
- [ ] Delete entire `apps/sh/` directory
- [ ] Remove `@epicenter/sh` references from root `package.json`
- [ ] Remove `@epicenter/sh` from `turbo.json` if present
- [ ] Update README.md to remove the link to `apps/sh` (since it won't exist)
- [ ] Check for and remove any other references to `apps/sh` in:
  - [ ] `.github/` workflows
  - [ ] Documentation in `docs/`
  - [ ] Any CI/CD configurations

**Updated README text (after removal):**
```markdown
<h3>🤖 Epicenter Assistant</h3>
<p><em>Currently being rebuilt from the ground up.</em></p>
<p>A local-first assistant you can chat with. It lives in your folder, becoming the access point to everything you've ever written, thought, or built.</p>
<p><strong>→ Track rebuild progress on the <a href="https://github.com/epicenter-md/epicenter/tree/rebuild-assistant">rebuild-assistant branch</a></strong></p>
```

### Phase 2: Rebuild on Feature Branch

**Branch:** `rebuild-assistant` (to be created from main after Phase 1 merges)

This will be a separate effort after Phase 1 is complete. The branch will:
- Start with a clean slate
- Implement Assistant functionality without waiting on external dependencies
- Use the already-merged CORS support in OpenCode
- Follow proper incremental development with reviewable commits

## Success Criteria

### Phase 1 Success:
- [ ] README accurately reflects that CORS PR is no longer a blocker
- [ ] Users know the Assistant is being rebuilt and where to track it
- [ ] Main branch is clean without incomplete Assistant code
- [ ] All references to `apps/sh` are removed or updated appropriately

### Phase 2 Success (Future):
- [ ] New Assistant implementation on `rebuild-assistant` branch
- [ ] Properly integrated with OpenCode's CORS support
- [ ] Incremental, reviewable development
- [ ] Clear documentation of functionality

## Implementation Order

1. **Now:** PR #1 (update README about CORS)
   - Update documentation to remove CORS blocker message
   - Add rebuild branch reference
   - Get this merged to main

2. **Next:** PR #2 (remove Assistant package)
   - Delete `apps/sh/` entirely
   - Remove all references
   - Clean up configuration files
   - Get this merged to main

3. **Later:** Create `rebuild-assistant` branch from main
   - Fresh start for Assistant implementation
   - Proper incremental development
   - This will be tracked separately

## Review

_This section will be filled in after implementation_

## Notes

- Both PRs should be kept small and focused
- PR #1 can be merged independently
- PR #2 should wait until we're ready to commit to removing the package
- The rebuild branch will allow experimentation without affecting main
- Users following the project will have clear visibility into the rebuild progress
