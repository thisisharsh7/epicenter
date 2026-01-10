# Epicenter Schema System

## Philosophy

Epicenter schemas are **the** schema definition for your data. They serve multiple purposes from a single source of truth:

- **Validation**: Runtime type checking and constraint enforcement
- **Forms**: Automatic UI generation with appropriate input components
- **Introspection**: JSON Schema export for tooling, documentation, and interop
- **Persistence**: Database column definitions

The key insight: a schema that knows it will render as a select dropdown can also validate enum constraints and export to JSON Schema's `enum` keyword on demand. These aren't separate concerns—they're facets of the same definition.

## Schema Format

Field schemas use a minimal Notion-like format optimized for user configuration:

```typescript
// Text field (NOT NULL by default)
{ type: 'text' }

// Nullable text field
{ type: 'text', nullable: true }

// Select field with options
{ type: 'select', options: ['draft', 'published'], default: 'draft' }

// Integer with default
{ type: 'integer', default: 0 }
```

**Key properties:**

- `type`: The discriminant that identifies the field type ('text', 'select', 'integer', etc.)
- `nullable`: Optional boolean for nullability (default: `false`)
- Type-specific fields: `options` for select/tags, `schema` for json, etc.

This format is NOT JSON Schema. JSON Schema can be derived on-demand for MCP/OpenAPI export.

## Nullability

Nullability uses a simple `nullable` boolean:

```typescript
// Non-nullable (default)
{ type: 'text' }
{ type: 'text', nullable: false }  // explicit

// Nullable
{ type: 'text', nullable: true }
```

**Special cases:**

- `id`: Never nullable (implicit)
- `richtext`: Always nullable (implicit, Y.Docs created lazily)

## Core Constraints

### Static Defaults

All default values must be JSON-serializable. No functions, no lazy evaluation.

```typescript
// Allowed
text({ default: 'draft' });
tags({ default: ['typescript'] });

// Not allowed
date({ default: () => new Date() }); // Function - not serializable
```

Dynamic values (timestamps, IDs) are set at runtime in handlers, not in schema definitions.

### JSON-Serializable

Everything in a schema definition must survive a JSON round-trip:

```typescript
JSON.parse(JSON.stringify(schema)); // Must preserve all information
```

This means: strings, numbers, booleans, null, arrays, and plain objects only.

## JSON Schema Export

Field schemas can be converted to JSON Schema on demand for MCP/OpenAPI export:

```
Field Schema                →  JSON Schema
{ type: 'text' }            →  { type: 'string' }
{ type: 'text',             →  { type: ['string', 'null'] }
  nullable: true }
{ type: 'select',           →  { type: 'string',
  options: ['a', 'b'] }          enum: ['a', 'b'] }
```

The converters in `./converters/` handle transformations to various formats (ArkType, TypeBox, Drizzle, JSON Schema).

## Mental Model

Think of schemas as **data that describes data**:

```
┌─────────────────────────────────────────────────────┐
│  Field Schema (TypeScript)                          │
│  ─────────────────────────────────                  │
│  { type: 'select',                                  │
│    options: ['draft', 'published'] }                │
└─────────────────────────────────────────────────────┘
                         ↓ convert (on demand)
┌─────────────────────────────────────────────────────┐
│  JSON Schema (for MCP/OpenAPI export)               │
│  ─────────────────────────────                      │
│  {                                                  │
│    "type": "string",                                │
│    "enum": ["draft", "published"]                   │
│  }                                                  │
└─────────────────────────────────────────────────────┘
```

The field schema is the source of truth. Other formats are derived representations.

## Naming Conventions

The codebase distinguishes between **Schema** (raw type constraints) and **Definition** (metadata + schema):

| Concept       | Single Item           | Map of Items         | Generic Parameter     |
| ------------- | --------------------- | -------------------- | --------------------- |
| **Field**     | `TextFieldSchema`     | `FieldSchemaMap`     | `TFieldSchemaMap`     |
| **Table**     | `TableDefinition`     | `TableDefinitionMap` | `TTableDefinitionMap` |
| **KV**        | `KvDefinition`        | `KvDefinitionMap`    | `TKvDefinitionMap`    |
| **Workspace** | `WorkspaceDefinition` | N/A                  | N/A                   |

**Schema** = raw type/constraint description (no metadata beyond the type discriminant):

```typescript
// FieldSchema examples
{ type: 'text', nullable: true }
{ type: 'select', options: ['a', 'b'] }
{ type: 'integer', default: 0 }
```

**Definition** = metadata + schema(s):

```typescript
// TableDefinition: name, icon, cover, description + fields (FieldSchemaMap)
{
  name: 'Blog Posts',
  icon: { type: 'emoji', value: '📝' },
  cover: null,
  description: 'All blog posts',
  fields: { id: id(), title: text(), published: boolean() }
}

// KvDefinition: name, icon, description + field (single FieldSchema)
{
  name: 'Theme',
  icon: { type: 'emoji', value: '🎨' },
  description: 'Application color theme',
  field: { type: 'select', options: ['light', 'dark'] }
}
```

This distinction keeps the naming predictable: if you're working with raw type constraints, look for `Schema`; if you need metadata, look for `Definition`.
