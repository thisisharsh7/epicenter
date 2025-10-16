/**
 * Test YJS Persistence Across Sessions
 * Verifies that YJS state persists to .epicenter/blog.yjs and reloads correctly
 */

import { createEpicenterClient } from '../../packages/epicenter/src/index';
import epicenterConfig from './epicenter.config';
import { existsSync } from 'node:fs';

async function main() {
	console.log('🧪 Testing YJS Persistence Across Sessions\n');

	// === Session 1: Create data ===
	console.log('📝 Session 1: Creating initial data...');
	const client1 = await createEpicenterClient(epicenterConfig);
	const blog1 = client1.blog;

	const { data: post1 } = await blog1.createPost({
		title: 'Persistence Test Post',
		content: 'This post should survive across sessions',
		category: 'tech',
	});
	console.log(`   Created post: ${post1.id}`);

	const { data: post2 } = await blog1.createPost({
		title: 'Second Test Post',
		content: 'Another post for testing',
		category: 'personal',
	});
	console.log(`   Created post: ${post2.id}`);

	// Publish the first post
	await blog1.publishPost({ id: post1.id });
	console.log(`   Published post: ${post1.id}`);

	// Add comments
	await blog1.addComment({
		postId: post1.id,
		author: 'Alice',
		content: 'Great post!',
	});
	console.log(`   Added comment to post: ${post1.id}`);

	// Wait for persistence
	await new Promise((resolve) => setTimeout(resolve, 200));

	// Verify .yjs file was created
	if (!existsSync('./.epicenter/blog.yjs')) {
		console.error('❌ ERROR: .epicenter/blog.yjs was not created!');
		process.exit(1);
	}
	console.log('   ✅ YJS file created at .epicenter/blog.yjs');

	// Clean up first session
	await client1.destroy();
	console.log('   Session 1 closed\n');

	// === Session 2: Verify data persists ===
	console.log('🔄 Session 2: Loading from persisted state...');
	const client2 = await createEpicenterClient(epicenterConfig);
	const blog2 = client2.blog;

	// Wait for indexes to sync
	await new Promise((resolve) => setTimeout(resolve, 200));

	// Query posts
	const { data: allPosts } = await blog2.getPublishedPosts();
	console.log(`   Found ${allPosts.length} published post(s)`);

	if (allPosts.length === 0) {
		console.error('❌ ERROR: No posts found after reload!');
		process.exit(1);
	}

	// Verify the first post exists
	const { data: retrievedPost } = await blog2.getPost({ id: post1.id });
	if (!retrievedPost) {
		console.error(`❌ ERROR: Post ${post1.id} not found after reload!`);
		process.exit(1);
	}

	console.log(`   ✅ Post found: ${retrievedPost.title}`);
	console.log(`   ✅ Published status: ${!!retrievedPost.publishedAt}`);

	// Verify comments
	const { data: comments } = await blog2.getPostComments({ postId: post1.id });
	console.log(`   ✅ Found ${comments.length} comment(s)`);

	if (comments.length === 0) {
		console.error('❌ ERROR: Comments did not persist!');
		process.exit(1);
	}

	// === Session 2: Make updates ===
	console.log('\n📝 Session 2: Making updates...');

	// Debug: Check if post exists in YJS
	const debugPost = await blog2.getPost({ id: post1.id });
	console.log(`   Debug - Post in index: ${debugPost.data?.title}`);

	await blog2.incrementViews({ id: post1.id });
	await blog2.incrementViews({ id: post1.id });
	console.log(`   Incremented views on post: ${post1.id}`);

	await client2.destroy();
	console.log('   Session 2 closed\n');

	// === Session 3: Verify updates persisted ===
	console.log('🔄 Session 3: Verifying updates persisted...');
	const client3 = await createEpicenterClient(epicenterConfig);
	const blog3 = client3.blog;

	// Wait for indexes to sync
	await new Promise((resolve) => setTimeout(resolve, 200));

	const { data: finalPost } = await blog3.getPost({ id: post1.id });
	if (!finalPost) {
		console.error(`❌ ERROR: Post ${post1.id} not found in session 3!`);
		process.exit(1);
	}

	console.log(`   ✅ Post found: ${finalPost.title}`);
	console.log(`   ✅ Views: ${finalPost.views} (should be 2)`);

	if (finalPost.views !== 2) {
		console.error(`❌ ERROR: Views not persisted correctly! Expected 2, got ${finalPost.views}`);
		process.exit(1);
	}

	await client3.destroy();
	console.log('   Session 3 closed\n');

	// === Session 4: Test deletion ===
	console.log('🗑️  Session 4: Testing deletion...');
	const client4 = await createEpicenterClient(epicenterConfig);
	const blog4 = client4.blog;

	// Wait for indexes to sync
	await new Promise((resolve) => setTimeout(resolve, 200));

	// Get all posts before deletion
	const { data: beforeDelete } = await blog4.getPublishedPosts();
	const countBefore = beforeDelete.length;
	console.log(`   Posts before deletion: ${countBefore}`);

	// Note: We need a delete action in the config to test this properly
	// For now, we'll just verify the count

	await client4.destroy();
	console.log('   Session 4 closed\n');

	console.log('✅ All persistence tests passed!\n');
	console.log('Summary:');
	console.log('  ✅ YJS state persists to .epicenter/blog.yjs');
	console.log('  ✅ Data survives across client restarts');
	console.log('  ✅ Updates persist correctly');
	console.log('  ✅ Published posts are queryable');
	console.log('  ✅ Comments are preserved');
	console.log('  ✅ View counts update correctly');

	process.exit(0);
}

main().catch((error) => {
	console.error('❌ Test failed:', error);
	process.exit(1);
});
