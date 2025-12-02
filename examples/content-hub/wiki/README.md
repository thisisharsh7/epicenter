# Wiki Workspace

Evergreen knowledge base entries that serve as the source of truth for all content.

## What Are Wiki Entries?

Wiki entries are permanent reference documents on specific topics. Unlike blog posts or articles that have a publication date and become stale, wiki entries are living documents that you continuously update as your understanding evolves.

Think of them like your personal Wikipedia: authoritative, topic-focused, and always current.

## Content Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   wiki.entries                                                  │
│   ────────────                                                  │
│   Source of truth. Permanent. Evergreen.                        │
│   Your authoritative take on a topic.                           │
│                                                                 │
│              │                                                  │
│              │ derives                                          │
│              ▼                                                  │
│                                                                 │
│   posts.*                                                       │
│   ───────                                                       │
│   Distribution. Platform-specific. Timestamped.                 │
│   Twitter, Reddit, YouTube, etc.                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Every post must reference a wiki entry via `entry_id`. This enforces a disciplined workflow: think first (wiki), then distribute (posts).

## How Wiki Differs from Pages

| Aspect | Wiki Entries | Pages |
|--------|--------------|-------|
| Purpose | Reference knowledge | Published content |
| Lifecycle | Continuously updated | Draft → Published |
| Time-bound | No (evergreen) | Yes (publication date) |
| Audience | Internal reference | External publication |

Use wiki for "what I know about X." Use pages for "what I published on Y date."

## Linking Between Entries

Entries can link to each other using standard markdown:

```markdown
See also [Related Topic](./related-topic.md) for more context.
```

No separate linking table needed; the connections live in the content itself.

## Schema

```typescript
entries: {
  id: id(),
  title: text(),           // The topic name
  content: text(),         // Markdown body (evergreen content)
  summary: text(),         // Short description for listings
  tags: tags(),            // Categorization
  created_at: date(),      // When first written
  updated_at: date(),      // When last modified
}
```
