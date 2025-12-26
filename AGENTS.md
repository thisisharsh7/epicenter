# Epicenter Project Rules

## External File Loading

CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## Specs and Docs

- **specs/**: Planning documents (design decisions, todos, timestamped)
- **docs/**: Reference materials (articles, patterns, guides, architecture)

Quick test: Planning something? → `specs/`. Documenting something learned? → `docs/`

## Development Guidelines

Load these domain-specific guidelines only when working in their respective domains:

**Language & Framework:**

- TypeScript code style and best practices: @rules/typescript.md
- Svelte patterns, TanStack Query, component composition: @rules/svelte.md
- Rust to TypeScript error handling (Tauri): @rules/rust.md

**Development Practices:**

- wellcrafted trySync/tryAsync error handling: @rules/error-handling.md
- General CSS and Tailwind styling: @rules/styling.md

**Tools & Workflows:**

- Git commits, PRs, conventional commits: @rules/git.md
- GitHub issue responses, community interaction: @rules/github.md
- PostHog analytics integration: @rules/posthog.md

**Content & Communication:**

- Technical writing, README guidelines, punctuation: @rules/documentation.md
- LinkedIn, Reddit, Twitter post guidelines: @rules/social-media.md

## Git Worktree Handling

CRITICAL: When working in a git worktree (such as `.conductor/` directories), ALL file operations and git commands MUST be performed within that worktree, not the parent repository.

**Detection**: If the working directory contains `.conductor/` in the path, you are in a worktree.

**Rules**:

- Use the working directory path for ALL file reads, writes, and edits
- Create branches and commits within the worktree's git context
- Never `cd` to the parent repo or use parent repo paths for edits
- The worktree has its own branch; changes in parent repo are separate

**Example**:

- Working directory: `/Users/foo/Code/repo/.conductor/riyadh`
- Correct file path: `/Users/foo/Code/repo/.conductor/riyadh/apps/app/file.ts`
- WRONG file path: `/Users/foo/Code/repo/apps/app/file.ts`

## General Guidelines

Read the following file immediately as it's relevant to all workflows: @rules/general-guidelines.md.

## Codebase Exploration Agents

Three "documentarian" agents that describe what exists without critiquing:

- **codebase-locator**: Finds WHERE files/components live
- **codebase-analyzer**: Explains HOW code works with file:line refs
- **codebase-pattern-finder**: Finds existing patterns to follow

Use `/research [question]` to orchestrate all three in parallel.
