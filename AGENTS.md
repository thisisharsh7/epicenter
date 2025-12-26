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
- `monorepo` - Script commands and conventions
- `workflow` - Standard workflow with specs and planning

**Content & Communication:**
- `documentation` - Technical writing, README guidelines
- `social-media` - LinkedIn, Reddit, Twitter post guidelines

**Behavioral:**
- `honesty` - Brutally honest feedback

## Specs and Docs

- **specs/**: Planning documents (design decisions, todos, timestamped)
- **docs/**: Reference materials (articles, patterns, guides, architecture)

Quick test: Planning something? → `specs/`. Documenting something learned? → `docs/`

## Expensive/Destructive Actions

1. Always get prior approval before performing expensive/destructive actions (tool calls).
   - Expensive actions require extended time to complete. Examples: test, build.
     - Why: Unexpected tests/builds just waste time and tokens. The test results are often inaccurate ("It works!" when it doesn't.)
   - Destructive actions result in permanent changes to project files. Examples: commit to git, push changes, edit a GitHub PR description.
      - Why: changes should be verified before adding to permanent project history. Often additional changes are needed.
2. Instead, you may automatically show a plan for the tool call you would like to make.
   - Commit messages should follow the conventional commits specification.
3. Then either the plan will be explicitly approved or changes to the plan will be requested.
4. Unless otherwise stated, any approval applies only to the plan directly before it. So any future action will require a new plan with associated approval.

## Codebase Exploration Agents

Three "documentarian" agents that describe what exists without critiquing:

- **codebase-locator**: Finds WHERE files/components live
- **codebase-analyzer**: Explains HOW code works with file:line refs
- **codebase-pattern-finder**: Finds existing patterns to follow

Use `/research [question]` to orchestrate all three in parallel.
