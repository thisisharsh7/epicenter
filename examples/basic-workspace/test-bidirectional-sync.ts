/**
 * Test bidirectional markdown sync
 * This test verifies that changes made to markdown files are synced back to YJS
 */

import { createEpicenterClient } from '../../packages/epicenter/src/index';
import epicenterConfig from './epicenter.config';

async function main() {
	console.log('🚀 Starting workspace with file watcher...');

	const client = await createEpicenterClient(epicenterConfig);
	const blog = client.blog;

	// Create a test post
	console.log('📝 Creating test post...');
	const { data: post } = await blog.createPost({
		title: 'Bidirectional Sync Test',
		content: 'Original content',
		category: 'tech',
	});
	console.log(`Created post with ID: ${post.id}`);

	// Wait for markdown file to be created
	await new Promise(resolve => setTimeout(resolve, 200));

	console.log('\n✏️  Please edit the markdown file manually:');
	console.log(`   File: test-data/content/posts/${post.id}.md`);
	console.log('   Change the title, content, or any other field');
	console.log('   Save the file, then press Enter to continue...\n');

	// Wait for user to edit the file
	await new Promise<void>((resolve) => {
		process.stdin.resume();
		process.stdin.once('data', () => {
			resolve();
		});
	});

	// Wait a bit for the file watcher to process the change
	console.log('\n⏳ Waiting for file watcher to process changes...');
	await new Promise(resolve => setTimeout(resolve, 500));

	// Query the post to see if changes were synced
	console.log('🔍 Querying post to verify changes...\n');
	const { data: updatedPost } = await blog.getPost({ id: post.id });

	console.log('Original post:');
	console.log(JSON.stringify(post, null, 2));
	console.log('\nPost after markdown edit:');
	console.log(JSON.stringify(updatedPost, null, 2));

	if (updatedPost.title !== post.title || updatedPost.content !== post.content) {
		console.log('\n✅ Bidirectional sync is working! Changes from markdown file were synced to YJS.');
	} else {
		console.log('\n⚠️  No changes detected. Make sure you edited and saved the markdown file.');
	}

	// Cleanup
	await client.destroy();
	process.exit(0);
}

main().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
