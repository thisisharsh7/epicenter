# Epicenter Web App Example

A simple web application demonstrating browser persistence with IndexedDB using Epicenter's `setupPersistence` helper.

## Features

- ✅ Create blog posts with title, content, and category
- ✅ Delete posts
- ✅ **Data persists across page refreshes** (stored in IndexedDB)
- ✅ Simple vanilla JavaScript (no framework)
- ✅ Clean, responsive UI

## How It Works

This example uses:
- **`setupPersistence`**: Epicenter's universal persistence helper
- **IndexedDB**: Browser storage for YJS documents
- **y-indexeddb**: YJS provider for IndexedDB persistence

When you create a post:
1. The post is added to the YJS document
2. `y-indexeddb` automatically saves to IndexedDB database named `"blog"`
3. On page refresh, the data is automatically loaded back
4. Everything "just works" - no manual save/load logic needed

## Running the Example

### Install dependencies
```bash
bun install
```

### Start dev server
```bash
bun run dev
```

Then open http://localhost:5173 in your browser.

## Inspecting Storage

To see the persisted data:

### Chrome/Edge
1. Open DevTools (F12)
2. Go to **Application** tab
3. Expand **IndexedDB** in the sidebar
4. Click on **blog** database
5. You'll see the YJS document stored there

### Firefox
1. Open DevTools (F12)
2. Go to **Storage** tab
3. Expand **IndexedDB**
4. Click on **blog** database

## Clearing Data

To reset the app:
1. Open DevTools → Application/Storage
2. Right-click on the **blog** IndexedDB database
3. Select **Delete database**
4. Refresh the page

## Key Files

- **`app.js`**: Main application logic with workspace definition
- **`index.html`**: Simple HTML structure
- **`style.css`**: Clean, modern styling
- **`package.json`**: Dependencies and scripts

## What This Demonstrates

### 1. Universal Persistence Helper
```javascript
import { setupPersistence } from '@epicenter/hq/providers';

const workspace = defineWorkspace({
  id: 'blog',  // → IndexedDB database name
  providers: [setupPersistence],
  // ...
});
```

### 2. Simple Actions Without Indexes
```javascript
actions: ({ db }) => ({
  createPost: async ({ title, content, category }) => {
    db.tables.posts.insert({
      id: generateId(),
      title,
      content,
      category,
      views: 0,
    });
  },

  getAllPosts: () => {
    return db.tables.posts
      .getAll()
      .filter((r) => r.status === 'valid')
      .map((r) => r.row);
  },
}),
```

### 3. Vanilla JavaScript UI
No framework needed - just DOM manipulation showing that Epicenter works anywhere JavaScript runs.

## Universal Persistence

The `setupPersistence` helper automatically adapts to the environment:

```javascript
import { setupPersistence } from '@repo/epicenter';

const workspace = defineWorkspace({
  id: 'blog',
  providers: [setupPersistence],
  // ...
});
```

- **In browser**: Uses IndexedDB via `y-indexeddb`
- **In Node.js/Tauri**: Uses filesystem in `.epicenter/` directory

Everything else is **identical** across all platforms! The API, the schema, the actions - all the same.

## Next Steps

Try these experiments:
1. Create some posts
2. Refresh the page - they persist!
3. Open DevTools and inspect IndexedDB
4. Modify a post in the YJS document directly via DevTools
5. Delete the IndexedDB database and watch the app reset

## Learn More

- [YJS Documentation](https://docs.yjs.dev/)
- [y-indexeddb Provider](https://github.com/yjs/y-indexeddb)
- [Epicenter Persistence Guide](../../../docs/yjs-persistence-guide.md)
