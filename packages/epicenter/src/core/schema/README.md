# Epicenter Schema System

## Philosophy

Epicenter schemas are **the** schema definition for your data. They serve multiple purposes from a single source of truth:

- **Validation**: Runtime type checking and constraint enforcement
- **Forms**: Automatic UI generation with appropriate input components
- **Introspection**: JSON Schema export for tooling, documentation, and interop
- **Persistence**: Database column definitions

The key insight: a schema that knows it will render as a select dropdown can also validate enum constraints and serialize to JSON Schema's `enum` keyword. These aren't separate concerns—they're facets of the same definition.

## Bidirectional Serialization

Every schema can be serialized to JSON Schema and reconstructed back:

```
Schema Definition  ←→  JSON Schema  ←→  Schema Definition
```

This enables:

- **Storage**: Save schema definitions as JSON
- **Transfer**: Send schemas over the network
- **Tooling**: Use any JSON Schema-compatible tool
- **Versioning**: Track schema changes in version control as data

### What Serializes

| Aspect      | JSON Schema Representation                             |
| ----------- | ------------------------------------------------------ |
| Types       | `type: "string"`, `type: "integer"`, etc.              |
| Constraints | `minLength`, `maxLength`, `minimum`, `maximum`, `enum` |
| Formats     | `format: "email"`, `format: "uri"`, `format: "date"`   |
| Nullability | `type: ["string", "null"]`                             |
| Defaults    | `default: "value"`                                     |
| UI Hints    | `x-component`, `x-placeholder`, `x-rows`               |

### What Doesn't Serialize (By Design)

- **Handlers**: Business logic lives outside schemas
- **TypeScript Types**: Runtime JSON has no generics; types are inferred on reconstruction

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

## Reconstruction Contract

Given a JSON Schema with Epicenter's `x-component` hints, you can rebuild the original schema:

1. Read `x-component` to determine the component type
2. Extract constraints from standard JSON Schema keywords
3. Extract UI hints from `x-*` extension keywords
4. Reconstruct the schema object with validation function

The validation function isn't serialized—it's **derived** from the constraints. Same constraints produce same validation behavior.

## Mental Model

Think of schemas as **data that describes data**:

```
┌─────────────────────────────────────────────────────┐
│  Schema Definition (TypeScript)                     │
│  ─────────────────────────────────                  │
│  select({ options: ['draft', 'published'] })        │
└─────────────────────────────────────────────────────┘
                         ↓ serialize
┌─────────────────────────────────────────────────────┐
│  JSON Schema (portable data)                        │
│  ─────────────────────────────                      │
│  {                                                  │
│    "type": "string",                                │
│    "enum": ["draft", "published"],                  │
│    "x-component": "select"                          │
│  }                                                  │
└─────────────────────────────────────────────────────┘
                         ↓ reconstruct
┌─────────────────────────────────────────────────────┐
│  Schema Definition (rebuilt)                        │
│  ─────────────────────────────                      │
│  Same validation, same UI, same constraints         │
└─────────────────────────────────────────────────────┘
```

The schema is the schema. JSON Schema is just its portable representation.
