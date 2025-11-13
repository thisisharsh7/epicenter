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

/**
 * Frontmatter field that contains timezone information.
 * This field will be read to extract the timezone value and then removed.
 */
const TIMEZONE_FIELD = 'timezone';

/**
 * Date fields that should have timezone appended.
 * Format: date|timezone (e.g., "2024-01-01|America/New_York")
 */
const DATE_FIELDS = ['date', 'created_at', 'updated_at'] as const;

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

type ProcessResult =
	| { status: 'modified'; file: string }
	| { status: 'skipped'; file: string }
	| { status: 'error'; file: string; error: string };

// Process each file
const results: ProcessResult[] = await Promise.all(
	markdownFiles.map(async (filePath): Promise<ProcessResult> => {
		// Read the file
		const { data, error } = await readMarkdownFile(filePath);
		if (error) {
			return { status: 'error', file: filePath, error: error.message };
		}

		const { data: frontmatter, body } = data;

		// Check if timezone exists
		const timezone = frontmatter[TIMEZONE_FIELD];
		if (!timezone) {
			return { status: 'skipped', file: filePath };
		}

		// Append timezone to date fields
		for (const field of DATE_FIELDS) {
			if (frontmatter[field]) {
				frontmatter[field] = `${frontmatter[field]}|${timezone}`;
			}
		}

		// Remove timezone field
		delete frontmatter[TIMEZONE_FIELD];

		// Write back (writeMarkdownFile handles YAML serialization)
		if (!dryRun) {
			const { error: writeError } = await writeMarkdownFile({
				filePath,
				frontmatter,
				body,
			});

			if (writeError) {
				return { status: 'error', file: filePath, error: writeError.message };
			}
		}

		return { status: 'modified', file: filePath };
	}),
);

// Aggregate results
const modified = results.filter((r) => r.status === 'modified');
const skipped = results.filter((r) => r.status === 'skipped');
const errors = results.filter((r) => r.status === 'error');

// Report results
console.log('📊 Timezone Append Summary:');
console.log(`  Total files scanned: ${markdownFiles.length}`);
console.log(`  Files modified: ${modified.length}`);
console.log(`  Files skipped (no timezone): ${skipped.length}`);
console.log(`  Errors: ${errors.length}\n`);

if (errors.length > 0) {
	console.log('❌ Errors:');
	for (const { file, error } of errors) {
		console.log(`  ${file.split('/').pop()}: ${error}`);
	}
}

if (dryRun) {
	console.log(
		'\n💡 This was a dry run. Run without --dry-run to apply changes.',
	);
} else {
	console.log('\n✅ All files with timezone have been updated.');
}
