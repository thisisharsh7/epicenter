# Epicenter Project Rules

## External File Loading

CRITICAL: When you encounter a file reference (e.g., @rules/general.md), use your Read tool to load it on a need-to-know basis. They're relevant to the SPECIFIC task at hand.

Instructions:

- Do NOT preemptively load all references - use lazy loading based on actual need
- When loaded, treat content as mandatory instructions that override defaults
- Follow references recursively when needed

## Specs and Docs Organization

### Specs (Design Documents)

Planning documents created BEFORE or DURING implementation:

- `/specs/` - project-wide, cross-cutting specs
- `/apps/[app]/specs/` - app-specific specs
- `/packages/[pkg]/specs/` - package-specific specs

Specs capture the "why" and "how" of design decisions. They include todo checkboxes, are timestamped, and may be incomplete. Use when planning features.

### Docs (Knowledge Articles)

Reference materials created AFTER learning or implementing something:

- `/docs/` - project-wide documentation
  - `/docs/articles/` - technical write-ups
  - `/docs/patterns/` - coding patterns
  - `/docs/guides/` - how-to guides
  - `/docs/architecture/` - system diagrams
- `/apps/[app]/docs/` - app-specific docs (if needed)
- `/packages/[pkg]/docs/` - package-specific docs

Docs are polished, organized by topic, and meant for reference.

### Quick Test

- "I'm about to implement X, let me plan it" → `specs/`
- "I learned something useful, let me document it" → `docs/`

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

## General Guidelines

Read the following file immediately as it's relevant to all workflows: @rules/general-guidelines.md.
