import {
	createEpicenterClient,
	defineEpicenter,
	defineQuery,
	id,
	sqliteIndex,
	text,
} from './src/index';
import { Ok } from 'wellcrafted/result';

// Create two simple workspaces
const workspaceA = defineEpicenter({
	id: 'a',
	version: 1,
	name: 'workspaceA',
	schema: {
		items: {
			id: id(),
			name: text(),
		},
	},
	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: ':memory:' }),
	}),
	actions: () => ({
		getValue: defineQuery({
			handler: () => Ok('value-from-workspaceA'),
		}),
	}),
});

const workspaceB = defineEpicenter({
	id: 'b',
	version: 1,
	name: 'workspaceB',
	workspaces: [workspaceA],
	schema: {
		items: {
			id: id(),
			name: text(),
		},
	},
	indexes: async ({ db }) => ({
		sqlite: await sqliteIndex(db, { database: ':memory:' }),
	}),
	actions: () => ({
		getValue: defineQuery({
			handler: () => Ok('value-from-workspaceB'),
		}),
	}),
});

// Create epicenter with both workspaces
const epicenter = defineEpicenter({
	id: 'test',
	workspaces: [workspaceA, workspaceB],
});

// Test the type inference
async function testInference() {
	const client = await createEpicenterClient(epicenter);

	// This should work - both workspaceA and workspaceB should be accessible
	const resultA = await client.workspaceA.getValue();
	const resultB = await client.workspaceB.getValue(); // ← Does this show a type error?

	console.log(resultA.data, resultB.data);

	client.destroy();
}

testInference();
