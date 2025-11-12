/**
 * Append timezone to date fields using pipe operator
 *
 * This script:
 * 1. Reads all markdown files
 * 2. Parses frontmatter
 * 3. If timezone exists, appends it to date, created_at, and updated_at with |
 * 4. Removes the timezone field
 * 5. Writes files back
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
	modified: 0,
	skipped: 0,
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

		// Check if timezone exists
		const timezone = frontmatter.timezone || frontmatter.timeZone;
		if (!timezone) {
			stats.skipped++;
			return;
		}

		// Append timezone to date fields
		const dateFields = ['date', 'created_at', 'updated_at'] as const;
		for (const field of dateFields) {
			if (frontmatter[field]) {
				frontmatter[field] = `${frontmatter[field]}|${timezone}`;
			}
		}

		// Remove timezone field
		delete frontmatter.timezone;
		delete frontmatter.timeZone;

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

		stats.modified++;
	}),
);

// Report results
console.log('📊 Timezone Append Summary:');
console.log(`  Total files scanned: ${stats.processed}`);
console.log(`  Files modified: ${stats.modified}`);
console.log(`  Files skipped (no timezone): ${stats.skipped}`);
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
	console.log('\n✅ All files with timezone have been updated.');
}
