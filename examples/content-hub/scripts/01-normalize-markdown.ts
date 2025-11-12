/**
 * Normalize markdown files by re-serializing frontmatter
 *
 * This script:
 * 1. Reads all markdown files
 * 2. Parses frontmatter using Bun.YAML.parse
 * 3. Re-serializes frontmatter using Bun.YAML.stringify
 * 4. Writes files back with consistent formatting
 *
 * Purpose: Standardize YAML formatting before doing transformations
 */

import {
	listMarkdownFiles,
	readMarkdownFile,
	writeMarkdownFile,
} from '@epicenter/hq/indexes/markdown';

const sourcePath = process.env.MARKDOWN_SOURCE_PATH;
if (!sourcePath) {
	console.error('❌ Error: MARKDOWN_SOURCE_PATH not set in .env file');
	console.error('Copy .env.example to .env and configure your path');
	process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

console.log(`🔍 Scanning: ${sourcePath}`);
if (dryRun) {
	console.log('🔍 DRY RUN MODE: No files will be modified\n');
}

// Find all markdown files recursively
const markdownFiles = await listMarkdownFiles(sourcePath);

console.log(`📄 Found ${markdownFiles.length} markdown files\n`);

const stats = {
	processed: 0,
	normalized: 0,
	errors: [] as Array<{ file: string; error: string }>,
};

// Process each file
await Promise.all(
	markdownFiles.map(async (filePath) => {
		stats.processed++;

		// Parse the file
		const parseResult = await readMarkdownFile(filePath);
		if (parseResult.error) {
			stats.errors.push({
				file: filePath,
				error: String(parseResult.error.message),
			});
			return;
		}

		const { data: frontmatter, body } = parseResult.data;

		// Write back (writeMarkdownFile handles YAML serialization)
		if (!dryRun) {
			const writeResult = await writeMarkdownFile({
				filePath,
				frontmatter,
				body,
			});

			if (writeResult.error) {
				stats.errors.push({
					file: filePath,
					error: String(writeResult.error.message),
				});
				return;
			}
		}

		stats.normalized++;
	}),
);

// Report results
console.log('📊 Normalization Summary:');
console.log(`  Total files scanned: ${stats.processed}`);
console.log(`  Files normalized: ${stats.normalized}`);
console.log(`  Errors: ${stats.errors.length}\n`);

if (stats.errors.length > 0) {
	console.log('❌ Errors:');
	for (const { file, error } of stats.errors.slice(0, 10)) {
		console.log(`  ${file.split('/').pop()}: ${error}`);
	}
	if (stats.errors.length > 10) {
		console.log(`  ... and ${stats.errors.length - 10} more`);
	}
}

if (dryRun) {
	console.log(
		'\n💡 This was a dry run. Run without --dry-run to apply changes.',
	);
} else {
	console.log('\n✅ All files normalized. YAML formatting is now consistent.');
}
