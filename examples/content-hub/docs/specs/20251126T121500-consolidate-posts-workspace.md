# Consolidate Social Media Workspaces into Posts Workspace

## Problem

Currently, the content-hub has 13 separate workspaces for social media platforms:
- **Video**: youtube, instagram, tiktok
- **Blogs**: medium, substack, personal-blog, epicenter-blog
- **Social**: reddit, twitter, discord, hackernews, producthunt, bookface

Each workspace is nearly identical in structure; they all:
1. Import a shared schema from `shared/schemas.ts`
2. Define identical indexes (sqlite, markdown)
3. Export identical CRUD operations
4. Export identical `getPostsByNiche` query

This creates unnecessary duplication and maintenance burden.

## Solution

Consolidate all 13 social media workspaces into a single `posts` workspace with multiple tables:

```typescript
export const posts = defineWorkspace({
  id: 'posts',
  schema: {
    // Video platforms
    youtube: SHORT_FORM_VIDEO_SCHEMA,
    tiktok: SHORT_FORM_VIDEO_SCHEMA,
    instagram: SHORT_FORM_VIDEO_SCHEMA,

    // Blog platforms
    medium: LONG_FORM_TEXT_SCHEMA,
    substack: LONG_FORM_TEXT_SCHEMA,
    personalBlog: LONG_FORM_TEXT_SCHEMA,
    epicenterBlog: LONG_FORM_TEXT_SCHEMA,

    // Social platforms
    reddit: SHORT_FORM_TEXT_SCHEMA,
    twitter: SHORT_FORM_TEXT_SCHEMA,
    discord: SHORT_FORM_TEXT_SCHEMA,
    hackernews: SHORT_FORM_TEXT_SCHEMA,
    producthunt: SHORT_FORM_TEXT_SCHEMA,
    bookface: SHORT_FORM_TEXT_SCHEMA,
  },
  ...
});
```

## Tasks

- [x] Create `posts/posts.workspace.ts` with consolidated schema
- [x] Move shared schemas inline to the posts workspace (eliminate `shared/schemas.ts` for these)
- [x] Delete individual platform workspace folders (13 folders)
- [x] Update `epicenter.config.ts` to import only the posts workspace
- [x] Remove the old shared schemas if no longer needed elsewhere
- [x] Update README.md to reflect new structure

## Files to Delete

- `youtube/youtube.workspace.ts` and folder
- `tiktok/tiktok.workspace.ts` and folder
- `instagram/instagram.workspace.ts` and folder
- `medium/medium.workspace.ts` and folder
- `substack/substack.workspace.ts` and folder
- `personal-blog/personal-blog.workspace.ts` and folder
- `epicenter-blog/epicenter-blog.workspace.ts` and folder
- `reddit/reddit.workspace.ts` and folder
- `twitter/twitter.workspace.ts` and folder
- `discord/discord.workspace.ts` and folder
- `hackernews/hackernews.workspace.ts` and folder
- `producthunt/producthunt.workspace.ts` and folder
- `bookface/bookface.workspace.ts` and folder

## Files to Create

- `posts/posts.workspace.ts`

## Files to Update

- `epicenter.config.ts`
- `shared/schemas.ts` (potentially remove if unused)

## Benefits

1. Single source of truth for all social media content
2. Eliminates 12 nearly-identical workspace files
3. Easier to add new platforms (just add a table)
4. Simpler config with fewer imports
5. Consistent exports across all platforms

## Review

### Changes Made

1. **Created `posts/posts.workspace.ts`**: A single workspace with 13 tables for all social media platforms. Schemas are now defined inline rather than imported from shared.

2. **Updated `epicenter.config.ts`**: Reduced from 20 imports to 8 imports. Now imports only: clippings, email, epicenter, githubIssues, journal, pages, posts, whispering.

3. **Deleted 13 workspace folders**: youtube, tiktok, instagram, medium, substack, personal-blog, epicenter-blog, reddit, twitter, discord, hackernews, producthunt, bookface.

4. **Deleted `shared/schemas.ts`**: No longer needed since schemas are inline in posts workspace. Kept `shared/niches.ts` (used by github-issues) and `shared/quality.ts` (used by clippings).

5. **Updated README.md**: Reflected new structure throughout; updated CLI examples, programmatic usage, directory structure, and extending instructions.

### Notes

- The epicenter-md folder had matching folders for each platform, but they only contained empty `posts/` subfolders. No data migration was needed.
- The exports structure changed from flat (`client.youtube.createPost`) to nested (`client.posts.youtube.create`).
- Adding a new platform is now simpler: just add a table to the posts workspace schema and exports.
