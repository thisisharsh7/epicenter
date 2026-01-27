import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import blogWorkspace from './epicenter.config';

let post1Id: string;
let post2Id: string;

test('YJS file is created on first session', async () => {
	console.log('Session 1: Creating initial data...');
	await using client = await blogWorkspace.create();

	const { data: post1 } = await client.actions.createPost({
		title: 'Persistence Test Post',
		content: 'This post should survive across sessions',
		category: 'tech',
	});
	post1Id = post1.id;
	console.log(`   Created post: ${post1Id}`);

	const { data: post2 } = await client.actions.createPost({
		title: 'Second Test Post',
		content: 'Another post for testing',
		category: 'personal',
	});
	post2Id = post2.id;
	console.log(`   Created post: ${post2Id}`);

	await client.actions.publishPost({ id: post1Id });
	console.log(`   Published post: ${post1Id}`);

	await client.actions.addComment({
		postId: post1Id,
		author: 'Alice',
		content: 'Great post!',
	});
	console.log(`   Added comment to post: ${post1Id}`);

	await new Promise((resolve) => setTimeout(resolve, 200));

	expect(existsSync('./.epicenter/providers/persistence/blog.yjs')).toBe(true);
	console.log(
		'   YJS file created at .epicenter/providers/persistence/blog.yjs',
	);
	console.log('   Session 1 closed\n');
});

test('data persists across sessions', async () => {
	console.log('Session 2: Loading from persisted state...');
	await using client = await blogWorkspace.create();

	await new Promise((resolve) => setTimeout(resolve, 200));

	const { data: allPosts } = await client.actions.getPublishedPosts();
	console.log(`   Found ${allPosts.length} published post(s)`);
	expect(allPosts.length).toBeGreaterThan(0);

	const { data: retrievedPosts } = await client.actions.getPost({
		id: post1Id,
	});
	const retrievedPost = retrievedPosts[0];
	expect(retrievedPost).toBeTruthy();
	expect(retrievedPost.title).toBe('Persistence Test Post');
	expect(retrievedPost.published_at).toBeTruthy();
	console.log(`   Post found: ${retrievedPost.title}`);

	const { data: comments } = await client.actions.getPostComments({
		post_id: post1Id,
	});
	expect(comments.length).toBeGreaterThan(0);
	console.log(`   Found ${comments.length} comment(s)`);
	console.log('   Session 2 closed\n');
});

test('updates persist across sessions', async () => {
	console.log('Session 3: Making updates...');
	await using client = await blogWorkspace.create();

	await new Promise((resolve) => setTimeout(resolve, 200));

	await client.actions.incrementViews({ id: post1Id });
	await client.actions.incrementViews({ id: post1Id });
	console.log(`   Incremented views on post: ${post1Id}`);
	console.log('   Session 3 closed\n');
});

test('updates are persisted after client disposal', async () => {
	console.log('Session 4: Verifying updates persisted...');
	await using client = await blogWorkspace.create();

	await new Promise((resolve) => setTimeout(resolve, 200));

	const { data: finalPosts } = await client.actions.getPost({ id: post1Id });
	const finalPost = finalPosts[0];
	expect(finalPost).toBeTruthy();
	expect(finalPost.views).toBe(2);
	console.log(`   Views: ${finalPost.views}`);
	console.log('   Session 4 closed\n');
});

test('can query all posts after multiple sessions', async () => {
	console.log('Session 5: Final verification...');
	await using client = await blogWorkspace.create();

	await new Promise((resolve) => setTimeout(resolve, 200));

	const { data: allPosts } = await client.actions.getPublishedPosts();
	expect(allPosts.length).toBeGreaterThan(0);
	console.log(`   Posts queryable: ${allPosts.length} post(s)\n`);
	console.log('   Session 5 closed\n');

	console.log('All persistence tests passed!');
});
