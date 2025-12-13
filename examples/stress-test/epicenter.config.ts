import {
	defineEpicenter,
	defineWorkspace,
	id,
	integer,
	text,
} from '@epicenter/hq';
import { sqliteProvider } from '@epicenter/hq/providers/sqlite';
import { setupPersistence } from '@epicenter/hq/providers/persistence';

/**
 * Stress test workspace
 *
 * 10 identical tables for stress testing YJS persistence with 1 million items.
 */
const stressWorkspace = defineWorkspace({
	id: 'stress',

	tables: {
		items_a: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_b: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_c: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_d: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_e: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_f: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_g: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_h: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_i: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
		items_j: {
			id: id(),
			name: text(),
			value: integer(),
			created_at: text(),
		},
	},

	providers: {
		persistence: setupPersistence,
		sqlite: (c) => sqliteProvider(c),
	},

	exports: ({ tables }) => ({
		// Expose raw table access for bulk inserts
		...tables,
	}),
});

export default defineEpicenter({
	id: 'stress-test',
	workspaces: [stressWorkspace],
});
