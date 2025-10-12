# Basic Workspace Example

This is a simple example demonstrating how to define and run an Epicenter workspace.

## What's This?

This folder simulates what it's like for a user to:
1. Define a workspace using `epicenter.config.ts`
2. Run the Epicenter runtime against that workspace
3. Execute actions (queries and mutations) on the workspace

## Structure

```
basic-workspace/
├── epicenter.config.ts   # Workspace definition
├── test.ts              # Test script that runs the workspace
└── README.md           # This file
```

## The Workspace

This example implements a simple blog workspace with:

### Tables
- **posts**: Blog posts with title, content, category, views, and publish date
- **comments**: Comments on posts

### Actions
- `getPublishedPosts()`: Query all published posts
- `getPost({ id })`: Query a specific post by ID
- `getPostComments({ postId })`: Query comments for a post
- `createPost({ title, content, category })`: Create a new post
- `publishPost({ id })`: Publish a post
- `addComment({ postId, author, content })`: Add a comment to a post
- `incrementViews({ id })`: Increment view count for a post

### Indexes
- **sqlite**: SQLite index for querying posts and comments

## Running the Test

```bash
# From the root of the repo
bun run examples/basic-workspace/test.ts
```

This will:
1. Initialize the workspace
2. Create sample posts
3. Publish a post
4. Add comments
5. Query the data
6. Display the results

## Key Concepts Demonstrated

1. **YJS Document**: The source of truth for all data
2. **Table Schemas**: Define column structure with pure JSON
3. **Indexes**: Synchronized snapshots for querying (SQLite in this case)
4. **Actions**: Business logic with access to tables (write) and indexes (read)
5. **Runtime**: `runWorkspace()` initializes everything and returns a typed API

## Data Flow

**Writes** go through table helpers:
```typescript
tables.posts.set({ id: '1', title: 'Hello' });
// YJS updated → SQLite synced automatically
```

**Reads** query indexes:
```typescript
await indexes.sqlite.posts.select().where(...).all();
```
