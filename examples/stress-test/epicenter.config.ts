import {
	defineEpicenter,
	defineWorkspace,
	id,
	integer,
	text,
} from '@epicenter/hq';
import { sqliteIndex } from '@epicenter/hq/indexes/sqlite';
import { setupPersistence } from '@epicenter/hq/providers';

/**
 * Stress test workspace
 *
 * 10 identical tables for stress testing YJS persistence with 1 million items.
 */
const stressWorkspace = defineWorkspace({
	id: 'stress',

	schema: {
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

	indexes: {
		sqlite: (c) => sqliteIndex(c),
	},

	providers: [setupPersistence],

	exports: ({ db }) => ({
		// Expose raw table access for bulk inserts
		...db,
	}),
});

export default defineEpicenter({
	id: 'stress-test',
	workspaces: [stressWorkspace],
});
