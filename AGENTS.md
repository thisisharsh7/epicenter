# Epicenter Project Rules

## Skills

Skills are located in `skills/` and are automatically discovered by their `SKILL.md` files. Each skill has a `description` field that explains when to use it. Load skills on-demand based on the task at hand.

### Available Skills

**Language & Framework:**
- `typescript` - TypeScript code style, type co-location, constant naming, arktype patterns
- `svelte` - Svelte 5 patterns, TanStack Query mutations, shadcn-svelte components
- `rust-errors` - Rust to TypeScript error handling for Tauri apps

**Development Practices:**
- `error-handling` - wellcrafted trySync/tryAsync patterns
- `styling` - CSS and Tailwind guidelines
- `control-flow` - Human-readable control flow patterns

**Tools & Workflows:**
- `git` - Conventional commits, PR guidelines
- `github-issues` - GitHub issue response templates
- `posthog` - PostHog analytics integration
- `monorepo` - Script commands and conventions
- `workflow` - Standard workflow with specs and planning
- `approval` - Expensive/destructive actions requiring approval

**Content & Communication:**
- `documentation` - Technical writing, README guidelines
- `social-media` - LinkedIn, Reddit, Twitter post guidelines

**Behavioral:**
- `honesty` - Brutally honest feedback

## Specs and Docs

- **specs/**: Planning documents (design decisions, todos, timestamped)
- **docs/**: Reference materials (articles, patterns, guides, architecture)

Quick test: Planning something? → `specs/`. Documenting something learned? → `docs/`

## Codebase Exploration Agents

Three "documentarian" agents that describe what exists without critiquing:

- **codebase-locator**: Finds WHERE files/components live
- **codebase-analyzer**: Explains HOW code works with file:line refs
- **codebase-pattern-finder**: Finds existing patterns to follow

Use `/research [question]` to orchestrate all three in parallel.
