# Content Hub: Flagship Epicenter Example

This example demonstrates a production-grade content distribution system managing content across multiple social media platforms and blogs. It showcases Epicenter's multi-workspace architecture, multi-table workspaces, and all major features in a real-world application.

## What's This?

Content Hub is a comprehensive system for managing content distribution across multiple platforms. It demonstrates how to:

1. Organize multiple workspaces in a single Epicenter application
2. Use multi-table workspaces for related content (all social posts in one workspace)
3. Build type-safe APIs with auto-generated CLI commands
4. Persist data with YJS and query with SQLite indexes
5. Structure a production-ready codebase

## Quick Start

### Setup

First, install dependencies from the repository root:

```bash
cd ../../..  # Go to repository root
bun install
```

### Run the Server

Start the Epicenter server (it runs by default with no subcommand):

```bash
cd examples/content-hub
bun dev
```

The server will start on `http://localhost:3913` with REST API and MCP endpoints.

### Use the CLI

In another terminal, you can use the CLI commands:

```bash
cd examples/content-hub

# Create a YouTube post
bun cli.ts posts youtube create --pageId "my-channel" --title "My First Video" --description "Check out this video" --niche "coding"

# Create a blog post on Medium
bun cli.ts posts medium create --pageId "my-blog" --title "Getting Started" --subtitle "A beginner's guide" --content "Here's how to start..." --niche "writing"

# Create a Twitter post
bun cli.ts posts twitter create --pageId "my-account" --content "Just shipped a new feature!" --niche "personal"

# Query all YouTube posts
bun cli.ts posts youtube getAll

# Get a specific post
bun cli.ts posts youtube get --id "post-123"
```

## Architecture

### Workspace Organization

```
content-hub/
├── shared/                          # Shared constants
│   ├── niches.ts                   # NICHES constant (10 values)
│   └── quality.ts                  # Quality options for clippings
├── pages/                           # Central content repository
│   └── pages.workspace.ts
├── posts/                           # All social media content (consolidated)
│   └── posts.workspace.ts          # 13 tables: youtube, tiktok, instagram,
│                                   # medium, substack, personalBlog, epicenterBlog,
│                                   # reddit, twitter, discord, hackernews,
│                                   # producthunt, bookface
├── journal/                         # Personal journal entries
│   └── journal.workspace.ts
├── whispering/                      # Voice transcriptions
│   └── whispering.workspace.ts
├── clippings/                       # Saved web content
│   └── clippings.workspace.ts
├── email/                           # Email workspace
│   └── email.workspace.ts
├── epicenter/                       # Company content
│   └── epicenter.workspace.ts
├── github-issues/                   # Development tracking
│   └── github-issues.workspace.ts
├── epicenter.config.ts             # Root config (imports all workspaces)
├── cli.ts                          # CLI entry point
├── package.json                    # Scripts and metadata
└── README.md                       # This file
```

### Data Flow

**Write Flow**:

```
Action called → YJS updated → Saved to .epicenter/[workspace].yjs → SQLite synced
```

**Read Flow**:

```
Query called → Read from SQLite index → Return data
```

**Persistence**:

- Desktop: YJS files stored in `.epicenter/` directory
- Browser: YJS files stored in IndexedDB
- Both: Universal `setupPersistence` provider handles platform detection

## Platforms & Schemas

### Video Platforms (SHORT_FORM_VIDEO_SCHEMA)

**Platforms**: YouTube, Instagram, TikTok

**Schema**:

```typescript
{
  id: id(),                    // Auto-generated unique ID
  pageId: id(),                // Reference to page/channel
  title: text(),               // Video title
  description: text(),         // Video description
  niche: select({ ... }),      // Single niche selection
  postedAt: date(),            // Publication timestamp
  updatedAt: date(),           // Last update timestamp
}
```

**Actions**: `getPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`, `getPostsByNiche`

### Blog Platforms (LONG_FORM_TEXT_SCHEMA)

**Platforms**: Medium, Substack, Personal Blog, Epicenter Blog

**Schema**:

```typescript
{
  id: id(),
  pageId: id(),
  title: text(),               // Article title
  subtitle: text(),            // Article subtitle
  content: text(),             // Full article content
  niche: select({ ... }),
  postedAt: date(),
  updatedAt: date(),
}
```

**Actions**: `getPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`, `getPostsByNiche`

### Social Platforms (SHORT_FORM_TEXT_SCHEMA)

**Platforms**: Reddit, Twitter, Hacker News, Discord, Product Hunt, Bookface

**Schema**:

```typescript
{
  id: id(),
  pageId: id(),
  content: text(),             // Post content
  title: text({ nullable: true }), // Optional title
  niche: select({ ... }),
  postedAt: date(),
  updatedAt: date(),
}
```

**Actions**: `getPosts`, `getPost`, `createPost`, `updatePost`, `deletePost`, `getPostsByNiche`

### GitHub Issues (Custom Schema)

**Platform**: GitHub Issues

**Schema**:

```typescript
{
  id: id(),
  repository: text(),          // e.g., "owner/repo"
  title: text(),
  body: text(),
  status: select({ options: ['open', 'in-progress', 'closed'] }),
  labels: tags({ options: ['bug', 'feature', 'documentation', 'enhancement', 'question'] }),
  niche: select({ ... }),
  createdAt: date(),
  updatedAt: date(),
}
```

**Actions**: `getIssues`, `getIssue`, `createIssue`, `updateIssue`, `closeIssue`, `getIssuesByStatus`, `getIssuesByRepository`

### Pages (Content Repository)

**Platform**: Central content storage

**Schema**:

```typescript
{
  id: id(),
  title: text(),
  content: text(),
  type: select({ options: ['blog', 'article', 'guide', 'tutorial', 'news'] }),
  tags: select({ options: ['tech', 'lifestyle', 'business', 'education', 'entertainment'] }),
}
```

**Actions**: `getPages`, `getPage`, `createPage`, `updatePage`, `deletePage`

## Niches

All workspaces (except Pages) use a shared `niche` field for categorization:

```typescript
'personal'; // Personal content
'epicenter'; // Epicenter-related
'y-combinator'; // Y Combinator
'yale'; // Yale University
'college-students'; // College student audience
'high-school-students'; // High school audience
'coding'; // Programming/tech
'productivity'; // Productivity tips
'ethics'; // Ethics discussions
'writing'; // Writing/content creation
```

## Features Demonstrated

1. **Multi-workspace architecture**: Multiple workspaces in a single application
2. **Multi-table workspaces**: Posts workspace contains 13 platform tables
3. **Type-safe actions**: All actions have input validation via arktype
4. **SQLite indexes**: Fast queries using Drizzle ORM
5. **Universal persistence**: Works on desktop (files) and browser (IndexedDB)
6. **CLI auto-generation**: All actions accessible via command line
7. **Workspace organization**: Modular structure with clear separation
8. **Consistent patterns**: Every table follows the same action structure

## CLI Reference

### General Usage

```bash
# List all workspaces and actions
bun cli.ts --help

# Get help for a specific workspace
bun cli.ts posts --help
```

### Common Operations

**Create Posts**:

```bash
# YouTube video
bun cli.ts posts youtube create --pageId "channel-1" --title "Tutorial" --description "Learn X" --niche "coding"

# Medium article
bun cli.ts posts medium create --pageId "blog-1" --title "Article" --subtitle "Subtitle" --content "Content..." --niche "writing"

# Twitter post
bun cli.ts posts twitter create --pageId "account-1" --content "My tweet" --niche "personal"
```

**Query Posts**:

```bash
# Get all posts from a platform
bun cli.ts posts youtube getAll

# Get specific post
bun cli.ts posts youtube get --id "post-123"
```

**Update Posts**:

```bash
# Update title and description
bun cli.ts posts youtube update --id "post-123" --title "New Title" --description "Updated"

# Update niche
bun cli.ts posts youtube update --id "post-123" --niche "productivity"
```

**Delete Posts**:

```bash
bun cli.ts posts youtube delete --id "post-123"
```

**GitHub Issues**:

```bash
# Create issue
bun cli.ts github-issues createIssue --repository "owner/repo" --title "Bug" --body "Description" --niche "coding"

# Close issue
bun cli.ts github-issues closeIssue --id "issue-123"

# Filter by status
bun cli.ts github-issues getIssuesByStatus --status "open"

# Filter by repository
bun cli.ts github-issues getIssuesByRepository --repository "owner/repo"
```

## Programmatic Usage

```typescript
import { createEpicenterClient } from '../../src/index';
import config from './epicenter.config';

// Create client with automatic cleanup
{
	using client = await createEpicenterClient(config);

	// Create a YouTube post
	const { data: post } = await client.posts.youtube.create({
		pageId: 'my-channel',
		title: 'My Video',
		description: 'Check this out',
		niche: 'coding',
	});

	console.log(`Created post: ${post.id}`);

	// Query posts
	const { data: posts } = await client.posts.youtube.getAll();
	console.log(`Total posts: ${posts.length}`);

	// Update a post
	await client.posts.youtube.update({
		id: post.id,
		title: 'Updated Title',
	});

	// Automatic cleanup when scope exits
}
```

## Directory Structure Explained

**`shared/`**: Contains reusable constants

- `niches.ts`: NICHES constant array and Niche type
- `quality.ts`: Quality options for clippings

**`posts/`**: Consolidated workspace for all social media content

- `posts.workspace.ts`: Single workspace with 13 tables (youtube, tiktok, instagram, medium, substack, personalBlog, epicenterBlog, reddit, twitter, discord, hackernews, producthunt, bookface)

**`[workspace-name]/`**: Each specialized workspace gets its own folder

- `[name].workspace.ts`: Workspace definition with schema, indexes, and actions
- Examples: `pages/`, `journal/`, `github-issues/`

**Root files**:

- `epicenter.config.ts`: Imports and aggregates all workspaces
- `cli.ts`: CLI entry point for command-line usage
- `package.json`: Scripts and metadata
- `README.md`: This documentation

**Generated at runtime**:

- `.epicenter/`: YJS and SQLite files (one per workspace)

## Extending the System

### Adding a New Social Media Platform

To add a new social platform (like LinkedIn), simply add a new table to the posts workspace:

1. **Edit `posts/posts.workspace.ts`**:

   ```typescript
   schema: {
     // ... existing tables
     linkedin: SHORT_FORM_TEXT_SCHEMA,
   },

   exports: ({ db, indexes }) => ({
     // ... existing exports
     linkedin: {
       getAll: db.linkedin.getAll,
       get: db.linkedin.get,
       create: db.linkedin.insert,
       update: db.linkedin.update,
       delete: db.linkedin.delete,
     },
   }),
   ```

2. **Test via CLI**:
   ```bash
   bun cli.ts posts linkedin create --help
   ```

### Adding a New Workspace

For content that doesn't fit the posts model, create a new workspace:

1. **Create workspace config**:

   ```bash
   mkdir new-workspace
   touch new-workspace/new-workspace.workspace.ts
   ```

2. **Implement workspace**:

   ```typescript
   import { defineWorkspace, sqliteIndex, ... } from '@epicenter/hq';
   import { setupPersistence } from '@epicenter/hq/providers';

   export const newWorkspace = defineWorkspace({
     id: 'new-workspace',
     schema: { items: { /* your schema */ } },
     indexes: { sqlite: (c) => sqliteIndex(c) },
     providers: [setupPersistence],
     exports: ({ db }) => ({
       // Implement actions...
     }),
   });
   ```

3. **Add to root config**:

   ```typescript
   // epicenter.config.ts
   import { newWorkspace } from './new-workspace/new-workspace.workspace';

   export default defineEpicenter({
   	id: 'content-hub',
   	workspaces: [
   		// ... existing workspaces
   		newWorkspace,
   	],
   });
   ```

### Adding a New Niche

1. **Update shared/niches.ts**:

   ```typescript
   export const NICHES = [
   	// ... existing niches
   	'new-niche',
   ] as const;
   ```

2. **Update all action input types** that reference niches (or use a type generator)

### Customizing Actions

Each workspace can have custom actions beyond the standard CRUD:

```typescript
exports: ({ db, indexes }) => ({
  // Standard actions...
  getPosts: defineQuery({ ... }),

  // Custom action
  getRecentPosts: defineQuery({
    input: type({ limit: "number" }),
    handler: async ({ limit }) => {
      const posts = await indexes.sqlite.db
        .select()
        .from(indexes.sqlite.posts)
        .orderBy(desc(indexes.sqlite.posts.postedAt))
        .limit(limit);
      return Ok(posts);
    },
  }),
}),
```

## Best Practices

1. **Use shared schemas** when multiple workspaces have similar data structures
2. **Follow naming conventions**: kebab-case for IDs, camelCase for variables and fields
3. **Add JSDoc comments** to workspaces and actions for better documentation
4. **Use `satisfies Row<typeof db.$schema.posts>`** for type safety in mutations
5. **Always update `updatedAt`** timestamp when modifying records
6. **Return `Ok(data)`** from all actions for consistent error handling

## Common Workflows

### Distributing Content

```typescript
// 1. Create original page content
const { data: page } = await client.pages.createPage({
	title: 'My Article',
	content: 'Full article content...',
	type: 'article',
	tags: 'tech',
});

// 2. Distribute to YouTube
await client.posts.youtube.create({
	pageId: page.id,
	title: 'Video version',
	description: 'Check out this video',
	niche: 'coding',
});

// 3. Distribute to Medium
await client.posts.medium.create({
	pageId: page.id,
	title: page.title,
	subtitle: 'An in-depth look',
	content: page.content,
	niche: 'writing',
});

// 4. Share on Twitter
await client.posts.twitter.create({
	pageId: page.id,
	content: 'Just published: My Article! Link in bio',
	niche: 'personal',
});
```

### Cross-Platform Analytics

```typescript
// Get all posts across platforms
const youtube = await client.posts.youtube.getAll();
const medium = await client.posts.medium.getAll();
const twitter = await client.posts.twitter.getAll();

const totalPosts =
	youtube.data.length +
	medium.data.length +
	twitter.data.length;

console.log(`Total posts: ${totalPosts}`);
```

## Troubleshooting

**Issue**: `Cannot find module` errors

- **Solution**: Ensure you're in the correct directory and imports use correct relative paths

**Issue**: Data not persisting

- **Solution**: Check that `.epicenter/` directory is writable and `setupPersistence` provider is configured

**Issue**: CLI commands not found

- **Solution**: Run `bun cli.ts --help` to see available workspaces and actions

**Issue**: TypeScript errors with niche types

- **Solution**: Ensure you're using the exact niche values from `shared/niches.ts`

## Production Considerations

This example is production-ready and can be used as-is or extended:

1. **Data Persistence**: YJS files are durable and work across sessions
2. **Scalability**: SQLite indexes provide fast queries even with large datasets
3. **Type Safety**: All actions are type-checked at compile time
4. **CLI**: Auto-generated CLI works out of the box
5. **Extensibility**: Add new workspaces or actions without breaking existing code

## Using as an MCP Server

This example can be used as an MCP (Model Context Protocol) server to connect with Claude Code or other AI assistants over HTTP.

### Quick Start

1. **Start your server** (already running if you followed Quick Start):

```bash
cd examples/content-hub
bun dev
```

2. **Add to Claude Code**:

```bash
claude mcp add content-hub --transport http --scope user http://localhost:3913/mcp
```

3. **Use in Claude Code**:

```
@epicenter-content-hub what tools do you have?
@epicenter-content-hub create a new page titled "Hello World" with content "My first post" tagged as tech
@epicenter-content-hub get all youtube posts
```

### How It Works

The Epicenter server automatically:

1. **Exposes REST endpoints** for each action at `/{workspace}/{action}`
2. **Exposes MCP endpoint** at `/mcp` using HTTP Server-Sent Events (SSE)
3. **Registers all actions as MCP tools** with input/output validation via TypeBox schemas

All actions from all workspaces become available as MCP tools with naming: `{workspace}_{action}` (e.g., `posts_youtube_create`, `pages_getPages`)

### Troubleshooting MCP

**Server Not Starting**:

- Check port availability: `lsof -i :3913`
- Verify workspace configuration is valid

**Claude Code Can't Connect**:

- Ensure server is running: `curl http://localhost:3913/mcp`
- Check `~/.claude.json` syntax
- Restart Claude Code after config changes

**Tools Not Appearing**:

- Verify actions are defined with `defineQuery` or `defineMutation`
- Check server logs for errors
- Restart Claude Code

## Next Steps

1. Explore individual workspace configurations in `workspaces/`
2. Try creating posts via CLI and programmatic API
3. Experiment with filtering and querying
4. Extend with your own platforms or custom schemas
5. Build a web UI on top using the Epicenter client API
6. Connect as MCP server to Claude Code or other AI assistants
