import {
	defineWorkspace,
	createWorkspaceClient,
	setupPersistence,
	id,
	text,
	integer,
	select,
	generateId,
} from '@repo/epicenter';

/**
 * Define a simple blog workspace with web persistence
 */
const blogWorkspace = defineWorkspace({
	id: 'blog',
	version: 1,
	name: 'blog',

	schema: {
		posts: {
			id: id(),
			title: text(),
			content: text({ nullable: true }),
			category: select({ options: ['tech', 'personal', 'tutorial'] }),
			views: integer({ default: 0 }),
		},
	},

	// Use persistence - data persists across page refreshes!
	providers: [setupPersistence],

	// No indexes needed for this simple example
	indexes: () => ({}),

	actions: ({ db }) => ({
		// Create a post
		createPost: async ({ title, content, category }) => {
			const post = {
				id: generateId(),
				title,
				content: content || null,
				category,
				views: 0,
			};
			db.tables.posts.insert(post);
			return post;
		},

		// Get all posts
		getAllPosts: () => {
			const results = db.tables.posts.getAll();
			return results
				.filter((r) => r.status === 'valid')
				.map((r) => r.row);
		},

		// Delete a post
		deletePost: ({ id }) => {
			db.tables.posts.delete(id);
		},
	}),
});

/**
 * Initialize the app
 */
async function initApp() {
	console.log('[App] Initializing workspace...');

	// Create workspace client
	const client = await createWorkspaceClient(blogWorkspace);
	console.log('[App] Workspace ready! Data persists in IndexedDB "blog"');

	// DOM elements
	const form = document.getElementById('create-form');
	const titleInput = document.getElementById('title-input');
	const contentInput = document.getElementById('content-input');
	const categoryInput = document.getElementById('category-input');
	const postsList = document.getElementById('posts-list');

	// Render posts
	function renderPosts() {
		const posts = client.getAllPosts();

		if (posts.length === 0) {
			postsList.innerHTML = '<p class="empty-state">No posts yet. Create one above!</p>';
			return;
		}

		postsList.innerHTML = posts
			.map(
				(post) => `
			<div class="post-item">
				<div class="post-content">
					<div class="post-title">${escapeHtml(post.title)}</div>
					${post.content ? `<div class="post-text">${escapeHtml(post.content)}</div>` : ''}
					<div class="post-meta">
						<span class="category-badge">${post.category}</span>
						<span class="views-badge">👁 ${post.views} views</span>
					</div>
				</div>
				<button class="delete-btn" data-id="${post.id}">Delete</button>
			</div>
		`,
			)
			.join('');

		// Attach delete handlers
		postsList.querySelectorAll('.delete-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const id = btn.dataset.id;
				client.deletePost({ id });
				renderPosts();
				console.log('[App] Post deleted:', id);
			});
		});
	}

	// Handle form submission
	form.addEventListener('submit', async (e) => {
		e.preventDefault();

		const title = titleInput.value.trim();
		const content = contentInput.value.trim();
		const category = categoryInput.value;

		if (!title || !category) return;

		const post = await client.createPost({ title, content, category });
		console.log('[App] Post created:', post);

		// Reset form
		form.reset();

		// Re-render
		renderPosts();
	});

	// Initial render
	renderPosts();

	console.log('[App] App initialized! Try:');
	console.log('1. Create a post');
	console.log('2. Refresh the page - your data persists!');
	console.log('3. Open DevTools → Application → IndexedDB → "blog" to inspect storage');
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Start the app
initApp().catch((error) => {
	console.error('[App] Failed to initialize:', error);
	document.body.innerHTML = `
		<div style="padding: 2rem; text-align: center; color: red;">
			<h1>Failed to initialize app</h1>
			<pre>${error.message}</pre>
		</div>
	`;
});
