/**
 * Migrate journal entries to database
 *
 * This script:
 * 1. Reads all markdown files from source directory
 * 2. Validates frontmatter using journal schema
 * 3. Inserts entries into database
 * 4. Deletes source files after successful migration
 */

import { createEpicenterClient } from '@epicenter/hq';
import {
	listMarkdownFiles,
	readMarkdownFile,
} from '@epicenter/hq/indexes/markdown';
import { type } from 'arktype';
import { basename } from 'node:path';
import { unlink } from 'node:fs/promises';
import epicenterConfig from '../epicenter.config';
import { extractErrorMessage } from 'wellcrafted/error';
import { tryAsync, Err } from 'wellcrafted/result';

const sourcePath = process.env.MARKDOWN_SOURCE_PATH;
if (!sourcePath) {
	console.error('❌ Error: MARKDOWN_SOURCE_PATH not set in .env file');
	console.error('Copy .env.example to .env and configure your path');
	process.exit(1);
}

const dryRun = process.argv.includes('--dry-run');

console.log(`🔗 Starting migration`);
console.log(`📂 Migrating from: ${sourcePath}`);
if (dryRun) {
	console.log('🔍 DRY RUN MODE: No database changes or file deletions\n');
}

// Create epicenter client
using client = await createEpicenterClient(epicenterConfig);

// Compose migration validator from primitives
const FrontMatter = client.journal.db.validators.journal
	.toArktype()
	.omit('id', 'content')
	.partial();

// Find all markdown files recursively
const markdownFiles = await listMarkdownFiles(sourcePath);

console.log(`📄 Found ${markdownFiles.length} markdown files\n`);

type ProcessResult =
	| { status: 'success'; file: string; id: string }
	| { status: 'error'; file: string; error: string };

// Process each file
const results: ProcessResult[] = await Promise.all(
	markdownFiles.map(async (filePath): Promise<ProcessResult> => {
		console.log('Processing:', filePath);

		// Read markdown file
		const parseResult = await readMarkdownFile(filePath);

		if (parseResult.error) {
			console.log('  ❌ Failed to read');
			return {
				status: 'error',
				file: filePath,
				error: extractErrorMessage(parseResult.error),
			};
		}

		const { data: frontmatter, body } = parseResult.data;

		// Extract ID from filename (not frontmatter)
		const id = basename(filePath, '.md');

		// Validate frontmatter structure (with partial to allow missing nullable fields)
		const validationResult = FrontMatter(frontmatter);
		if (validationResult instanceof type.errors) {
			console.log('  ❌ Failed validation:');
			console.log('    ', validationResult.summary);
			return {
				status: 'error',
				file: filePath,
				error: validationResult.summary,
			};
		}

		// Build entry object, converting undefined to null
		const entryData = {
			id,
			content: body,
			...Object.fromEntries(
				Object.entries(validationResult).map(([key, value]) => [
					key,
					value ?? null,
				]),
			),
		};

		// Validate the final entry BEFORE inserting to prevent data loss
		const finalValidator = client.journal.db.validators.journal.toArktype();
		const entry = finalValidator(entryData);

		if (entry instanceof type.errors) {
			console.log('  ❌ Final validation failed (entry NOT inserted):');
			console.log('    ', entry.summary);
			return {
				status: 'error',
				file: filePath,
				error: entry.summary,
			};
		}

		// Debug logging
		console.log('  📋 Entry to insert:');
		console.log('    ID:', entry.id);
		console.log('    Title:', entry.title || '(no title)');
		console.log('    Date:', entry.date || '(no date)');

		// Create entry via client (skip in dry-run mode)
		if (!dryRun) {
			const result = client.journal.createJournalEntry(entry);

			if (result.error) {
				const errorMessage = extractErrorMessage(result.error);
				console.log('  ❌ Failed to create entry in YJS:', errorMessage);
				return {
					status: 'error',
					file: filePath,
					error: `YJS insert failed: ${errorMessage}`,
				};
			}

			console.log('  ✅ Created entry in YJS:', entry.id);

			// Verify SQLite insert succeeded before deleting source file
			const sqliteRow = client.journal.db.tables.journal.get(entry.id);
			if (!sqliteRow) {
				console.log('  ⚠️  WARNING: Entry created in YJS but NOT in SQLite');
				console.log('  📝 Source file preserved for safety');
				return {
					status: 'error',
					file: filePath,
					error:
						'SQLite insert failed - check logs at .epicenter/sqlite/journal.log',
				};
			}

			console.log('  ✅ Verified in SQLite:', entry.id);

			// NOW safe to delete source file
			const deleteResult = await tryAsync({
				try: () => unlink(filePath),
				catch: (error) =>
					Err({
						message: 'Failed to delete source file',
						context: { filePath, error: extractErrorMessage(error) },
					}),
			});

			if (deleteResult.error) {
				console.log('  ⚠️  Migrated but failed to delete source file');
			} else {
				console.log('  🗑️  Deleted source file');
			}
		} else {
			console.log('  ⏭️  Skipped (dry-run mode)');
		}

		return {
			status: 'success',
			file: filePath,
			id: entry.id,
		};
	}),
);

// Aggregate results
const successes = results.filter((r) => r.status === 'success');
const errors = results.filter((r) => r.status === 'error');

// Report results
console.log('\n📊 Migration Summary:');
console.log(`  Total files scanned: ${markdownFiles.length}`);
console.log(`  Files migrated: ${successes.length}`);
console.log(`  Errors: ${errors.length}\n`);

if (errors.length > 0) {
	console.log('❌ Errors:');
	for (const result of errors) {
		if (result.status === 'error') {
			console.log(`  ${result.file.split('/').pop()}: ${result.error}`);
		}
	}
}

if (dryRun) {
	console.log(
		'\n💡 This was a dry run. Run without --dry-run to apply changes.',
	);
} else {
	console.log('\n✅ Migration complete. Source files have been processed.');
}

// Exit with error code if there were any errors
process.exit(errors.length > 0 ? 1 : 0);
