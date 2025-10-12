/**
 * Test script for the basic workspace
 * Demonstrates how to run the Epicenter runtime against a workspace config
 */

import { createWorkspaceClient } from '../../packages/epicenter/src/index';
import workspace from './epicenter.config';

async function main() {
	console.log('🚀 Starting workspace...');

	// Run the workspace - this initializes the YJS doc, indexes, and actions
	const blog = await createWorkspaceClient(workspace);

	console.log('✅ Workspace initialized successfully');
	console.log('📝 Creating sample posts...\n');

	// Create some posts
	const {data: post1 } = await blog.createPost({
		title: 'Getting Started with Epicenter',
		content:
			'Epicenter is a YJS-first workspace system for building collaborative applications.',
		category: 'tutorial',
	});

	const {data: post2 } = await blog.createPost({
		title: 'My First Blog Post',
		content: 'This is my personal blog about software development.',
		category: 'personal',
	});

	console.log('Created posts:');
	console.log(`  - ${post1.title} (${post1.category}) [id: ${post1.id}]`);
	console.log(`  - ${post2.title} (${post2.category}) [id: ${post2.id}]`);

	// Publish the first post
	console.log('\n📤 Publishing first post...');
	await blog.publishPost({ id: post1.id });

	// Add comments to the published post
	console.log('💬 Adding comments...');
	await blog.addComment({
		postId: post1.id,
		author: 'Alice',
		content: 'Great tutorial!',
	});

	await blog.addComment({
		postId: post1.id,
		author: 'Bob',
		content: 'Very helpful, thanks!',
	});

	// Increment views
	console.log('👀 Incrementing views...');
	await blog.incrementViews({ id: post1.id });
	await blog.incrementViews({ id: post1.id });

	// HACK: Give the sqlite observer time to process YJS changes
	// TODO: Make observers awaitable to eliminate this race condition
	await new Promise(resolve => setTimeout(resolve, 50));

	// Query published posts
	console.log('\n📚 Fetching published posts...');
	const result = await blog.getPublishedPosts();
	const publishedPosts = await result.data;
	console.log(`Found ${publishedPosts.length} published post(s):`);
	for (const post of publishedPosts) {
		console.log(
			`  - ${post.title} (${post.views} views, category: ${post.category})`,
		);
	}

	// Get comments for a post
	console.log(`\n💬 Fetching comments for first post (id: ${post1.id})...`);
	const result2 = await blog.getPostComments({ postId: post1.id });
	const comments = await result2.data;
	console.log(`Found ${comments.length} comment(s):`);
	for (const comment of comments) {
		console.log(`  - ${comment.author}: ${comment.content}`);
	}

	console.log('\n✅ Test completed successfully!');
}

main().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
