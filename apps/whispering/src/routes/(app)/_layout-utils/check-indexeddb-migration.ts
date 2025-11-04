import { toast } from 'svelte-sonner';
import { migrationDialog } from '$lib/components/MigrationDialog.svelte';

/**
 * Check if IndexedDB has data and show a migration toast if it does.
 * This helps users discover the migration feature and encourages them to migrate legacy data.
 */
export async function checkIndexedDBMigration(): Promise<void> {
	if (!window.__TAURI_INTERNALS__) {
		// Only run in desktop app
		return;
	}

	await migrationDialog.refreshCounts();

	if (migrationDialog.hasIndexedDBData) {
		toast.info('Database Migration Available', {
			description:
				'You have data in IndexedDB. Click here to migrate to the faster file system storage.',
			duration: 10000,
			action: {
				label: 'Migrate Now',
				onClick: () => {
					migrationDialog.isOpen = true;
				},
			},
		});
	}
}
