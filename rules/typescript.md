# TypeScript Guidelines

## Core Rules

- Always use `type` instead of `interface` in TypeScript.
- TypeScript 5.5+ automatically infers type predicates in `.filter()` callbacks. Don't add manual type assertions:
  ```typescript
  // Good - TypeScript infers the narrowed type automatically
  const filtered = items.filter((x) => x !== undefined);

  // Bad - unnecessary type predicate
  const filtered = items.filter((x): x is NonNullable<typeof x> => x !== undefined);
  ```
- When moving components to new locations, always update relative imports to absolute imports (e.g., change `import Component from '../Component.svelte'` to `import Component from '$lib/components/Component.svelte'`)
- When functions are only used in the return statement of a factory/creator function, use object method shorthand syntax instead of defining them separately. For example, instead of:
  ```typescript
  function myFunction() {
  	const helper = () => {
  		/* ... */
  	};
  	return { helper };
  }
  ```
  Use:
  ```typescript
  function myFunction() {
  	return {
  		helper() {
  			/* ... */
  		},
  	};
  }
  ```

# Type Co-location Principles

## Never Use Generic Type Buckets

Don't create generic type files like `$lib/types/models.ts`. This creates unclear dependencies and makes code harder to maintain.

### Bad Pattern

```typescript
// $lib/types/models.ts - Generic bucket for unrelated types
export type LocalModelConfig = { ... };
export type UserModel = { ... };
export type SessionModel = { ... };
```

### Good Pattern

```typescript
// $lib/services/transcription/local/types.ts - Co-located with service
export type LocalModelConfig = { ... };

// $lib/services/user/types.ts - Co-located with user service
export type UserModel = { ... };
```

## Co-location Rules

1. **Service-specific types**: Place in `[service-folder]/types.ts`
2. **Component-specific types**: Define directly in the component file
3. **Shared domain types**: Place in the domain folder's `types.ts`
4. **Cross-domain types**: Only if truly shared across multiple domains, place in `$lib/types/[specific-name].ts`

## Benefits

- Clear ownership and dependencies
- Easier refactoring and deletion
- Better code organization
- Reduces coupling between unrelated features

# Constant Array Naming Conventions

## Pattern Summary

| Pattern | Suffix | Description | Example |
|---------|--------|-------------|---------|
| Rich array (source of truth) | Plural noun | Contains all metadata | `PROVIDERS`, `TRANSCRIPTION_SERVICES` |
| IDs only (for validation) | `_IDS` | Derived from rich array | `PROVIDER_IDS` |
| UI options `{value, label}` | `_OPTIONS` | For dropdowns/selects | `PROVIDER_OPTIONS` |
| Label map | `_TO_LABEL` (singular) | `Record<Id, string>` | `LANGUAGES_TO_LABEL` |

## Rich Array First Pattern

The **rich array should be the single source of truth**, with IDs and options derived from it:

```typescript
// 1. Rich array (source of truth)
export const PROVIDERS = [
  { id: 'OpenAI', label: 'OpenAI' },
  { id: 'Groq', label: 'Groq' },
] as const;

// 2. Derived type
export type ProviderId = (typeof PROVIDERS)[number]['id'];

// 3. Derived IDs (for arktype/zod validation)
export const PROVIDER_IDS = PROVIDERS.map(p => p.id) as unknown as readonly ProviderId[];

// 4. Derived options (for UI)
export const PROVIDER_OPTIONS = PROVIDERS.map(p => ({
  value: p.id,
  label: p.label,
}));
```

## Naming Rules

### Source Arrays
- Use **plural noun**: `PROVIDERS`, `MODES`, `LANGUAGES`
- Add unit suffix when relevant: `BITRATES_KBPS`
- Avoid redundant `_VALUES` suffix

### Derived Arrays
- Use **singular noun** + suffix: `PROVIDER_IDS`, `MODE_OPTIONS`
- This reads naturally: "provider IDs" (IDs for selecting a provider)

### Label Maps
- Use **singular** `_TO_LABEL` suffix: `LANGUAGES_TO_LABEL`
- Describes the operation (id → label), not the container
- Reads naturally: `LANGUAGES_TO_LABEL[lang]` = "get the label for this language"

### Constant Casing
- Always use `SCREAMING_SNAKE_CASE` for exported constants
- Never use `camelCase` for constant objects/arrays

## Co-location

Options arrays should be co-located with their source array in the same file:

```typescript
// constants/audio/bitrate.ts
export const BITRATES_KBPS = ['16', '32', '64', '128'] as const;

export const BITRATE_OPTIONS = BITRATES_KBPS.map((bitrate) => ({
  label: `${bitrate} kbps`,
  value: bitrate,
}));
```

Avoid creating options inline in Svelte components; import pre-defined options instead.

# Arktype Optional Properties

## Never Use `| undefined` for Optional Properties

When defining optional properties in arktype schemas, always use the `'key?'` syntax instead of `| undefined` unions. This is critical for JSON Schema conversion (used by OpenAPI/MCP).

### Bad Pattern

```typescript
// DON'T: Explicit undefined union - breaks JSON Schema conversion
const schema = type({
  window_id: 'string | undefined',
  url: 'string | undefined',
});
```

This produces invalid JSON Schema with `anyOf: [{type: "string"}, {}]` because `undefined` has no JSON Schema equivalent.

### Good Pattern

```typescript
// DO: Optional property syntax - converts cleanly to JSON Schema
const schema = type({
  'window_id?': 'string',
  'url?': 'string',
});
```

This correctly omits properties from the `required` array in JSON Schema.

### Why This Matters

| Syntax | TypeScript Behavior | JSON Schema |
|--------|---------------------|-------------|
| `key: 'string \| undefined'` | Required prop, accepts string or undefined | Broken (triggers fallback) |
| `'key?': 'string'` | Optional prop, accepts string | Clean (omitted from `required`) |

Both behave similarly in TypeScript, but only the `?` syntax converts correctly to JSON Schema for OpenAPI documentation and MCP tool schemas.
