# Markdown Index

The Markdown Index provides bidirectional synchronization between your YJS documents and markdown files on disk. This enables git-friendly workflows where you can edit data either through your application or by directly editing markdown files.

## What It Does

The Markdown Index keeps your YJS database and markdown files in sync. When you add, update, or delete records in your database, those changes are automatically written to markdown files. When you edit markdown files directly (for example, in your text editor or through git operations), those changes flow back into the database.

## Why Use It

Traditional databases store data in binary formats that don't work well with version control systems like git. The Markdown Index solves this by storing each record as a human-readable markdown file with YAML frontmatter. This gives you:

- **Git-friendly storage**: Markdown files can be diffed, merged, and versioned
- **Direct editing**: Edit your data in any text editor
- **Human readability**: No need for special tools to view or modify your data
- **Backup simplicity**: Your data is just files on disk

## How It Works

### Markdown File Format

Each database record becomes a markdown file:

```markdown
---
id: abc123
title: My Blog Post
published: true
tags:
  - typescript
  - database
---

This is the content of my blog post. Everything after the frontmatter
becomes the "content" field.
```

The YAML frontmatter contains your structured data, and anything after the `---` delimiter is stored as markdown content.

### File Organization

Files are organized by table name:

```
storage/
  posts/
    abc123.md
    def456.md
  authors/
    john-doe.md
    jane-smith.md
```

Each table gets its own directory, and each record becomes a file named after its ID.

### Bidirectional Sync

The index watches for changes in both directions:

**Database → Files**: When you insert, update, or delete records through your application, the corresponding markdown files are automatically created, updated, or deleted.

**Files → Database**: When you edit, create, or delete markdown files directly (using a text editor, git operations, or any other tool), those changes are detected and synchronized back to the database.

### Data Type Handling

Different column types are handled appropriately:

- **Text fields**: Stored as plain strings in YAML
- **Numbers**: Stored as YAML numbers (no quotes)
- **Booleans**: Stored as YAML booleans (`true`/`false`)
- **Multi-select fields**: Stored as YAML arrays
- **Rich text**: Converted to plain strings (Y.Text becomes string)

### Granular Updates

When syncing changes from markdown files back to the database, the index uses granular diff algorithms instead of replacing entire values. This preserves the collaborative editing properties of YJS CRDTs and minimizes conflicts in multi-user scenarios.

For text fields, character-level diffs are computed. For array fields like multi-select, element-level diffs are computed. This means if you change a single character or add a single tag, only that specific change is applied rather than replacing the entire field.

## Usage

### Setup

Create a markdown index when defining your workspace:

```typescript
import { defineWorkspace, markdownIndex } from 'epicenter';

const workspace = defineWorkspace({
  schema: {
    posts: {
      id: id(),
      title: text(),
      content: text({ nullable: true }),
      tags: multiSelect({ options: ['tech', 'design', 'product'] }),
      published: boolean({ default: false }),
    },
  },

  indexes: ({ db }) => ({
    markdown: markdownIndex(db, {
      rootPath: path.join(import.meta.dirname, './content'), // Absolute root path
      pathToTableAndId: ({ path }) => {
        const parts = path.split('/');
        return { tableName: parts[0], id: parts[1].replace('.md', '') };
      },
      tableAndIdToPath: ({ tableName, id }) => `${tableName}/${id}.md`,
    }),
  }),
});
```

### Working with Data

Once configured, you can work with your data in two ways:

**Through the application**:

```typescript
// Insert a post (markdown file created automatically)
db.tables.posts.insert({
  id: 'hello-world',
  title: 'Hello World',
  content: 'My first post',
  tags: ['tech'],
  published: true,
});

// Update a post (markdown file updated automatically)
db.tables.posts.update({
  id: 'hello-world',
  published: true,
});
```

**By editing markdown files directly**:

Edit `content/posts/hello-world.md`:

```markdown
---
id: hello-world
title: Hello World (Updated)
content: My first post
tags:
  - tech
  - design
published: true
---
```

Save the file, and the changes automatically sync to your database.

## Loop Prevention

The index prevents infinite loops between file changes and database changes using simple flag-based guards. When processing a database change, file watch events are ignored. When processing a file change, database observers are ignored. This ensures changes only propagate in one direction at a time.

## Error Handling

Parse and validation errors are handled gracefully:

- **Invalid YAML**: Errors are logged, the file is skipped, and the system continues running
- **Schema mismatches**: If a markdown file doesn't match your table schema, an error is logged and the file is skipped
- **File system errors**: Missing directories are created automatically, and file deletion failures are treated as warnings

The system is designed to be resilient to errors in individual files rather than crashing the entire application.

## Limitations

- **Y.XmlFragment fields**: Currently not supported (future enhancement)
- **File watcher noise**: File systems can generate multiple events for a single change, but the index handles this gracefully through idempotent operations
- **Large files**: Each record becomes its own file, which works well for most use cases but may not be ideal for extremely large datasets

## When to Use

The Markdown Index is ideal when:

- You want git-friendly storage for your data
- You want to edit records directly in a text editor
- You're building a content-focused application (blog, documentation site, notes app)
- You need human-readable backups of your data

Consider alternatives when:

- You need high-performance writes for large datasets
- Your data is primarily binary or doesn't map well to markdown
- You don't need the git/direct-editing benefits
