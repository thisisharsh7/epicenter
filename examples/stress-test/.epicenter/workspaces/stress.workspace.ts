import {
	defineWorkspace,
	id,
	integer,
	sqliteProvider,
	text,
} from '@epicenter/hq';
import { setupPersistence } from '@epicenter/hq/providers';

export default defineWorkspace({
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
		...tables,
	}),
});
