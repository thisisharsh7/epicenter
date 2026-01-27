# Epicenter

Local-first workspace platform. Monorepo with Yjs CRDTs, Tauri desktop app, and Svelte UI.

**Structure**: `apps/epicenter/` (Tauri app), `packages/epicenter/` (core TypeScript/Yjs library), `packages/ui/` (shadcn-svelte components), `specs/` (planning docs), `docs/` (reference materials).

**Skills**: Task-specific instructions live in `.claude/skills/`. Load on-demand based on the task.

**Approval needed**: Tests, builds, force pushes, branch deletions, editing PR descriptions.

**Git worktrees**: When in `.conductor/` directories, all file operations must use that worktree path, not the parent repo.
