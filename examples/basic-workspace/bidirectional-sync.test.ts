import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import blogWorkspace from './epicenter.config';

test('markdown file edits sync back to YJS', async () => {
	console.log('Testing bidirectional markdown sync...');

	await using client = await blogWorkspace.create();

	console.log('Creating test post...');
	const { data: post } = await client.actions.createPost({
		title: 'Bidirectional Sync Test',
		content: 'Original content',
		category: 'tech',
	});
	console.log(`   Created post with ID: ${post.id}`);

	await new Promise((resolve) => setTimeout(resolve, 300));

	const markdownPath = join(process.cwd(), 'blog/posts', `${post.id}.md`);
	const fileExists = (() => {
		try {
			readFileSync(markdownPath, 'utf-8');
			return true;
		} catch {
			return false;
		}
	})();
	expect(fileExists).toBe(true);
	console.log(`   Markdown file created: ${markdownPath}`);

	const originalContent = readFileSync(markdownPath, 'utf-8');
	console.log('   Original markdown content read');

	console.log('Editing markdown file programmatically...');
	const updatedContent = originalContent
		.replace('title: Bidirectional Sync Test', 'title: Updated Title')
		.replace('content: Original content', 'content: Updated content via file');
	await Bun.write(markdownPath, updatedContent);
	console.log('   Markdown file updated');

	console.log('Waiting for file watcher to process changes...');
	await new Promise((resolve) => setTimeout(resolve, 1500));

	console.log('Querying post to verify changes synced...');
	const { data: updatedPosts } = await client.actions.getPost({ id: post.id });
	const updatedPost = updatedPosts[0];

	expect(updatedPost).toBeTruthy();
	expect(updatedPost.title).toBe('Updated Title');
	expect(updatedPost.content).toBe('Updated content via file');

	console.log('   Original post:');
	console.log(`      Title: "${post.title}"`);
	console.log(`      Content: "${post.content}"`);
	console.log('   Updated post (from markdown edit):');
	console.log(`      Title: "${updatedPost.title}"`);
	console.log(`      Content: "${updatedPost.content}"`);

	console.log(
		'\nBidirectional sync is working! Changes from markdown file synced to YJS.',
	);
});
