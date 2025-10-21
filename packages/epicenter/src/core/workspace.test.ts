import { describe, test, expect } from 'bun:test';
import { createEpicenterClient, defineEpicenter } from './workspace';
import { id, text } from './schema';
import { defineQuery } from './actions';
import { Ok } from 'wellcrafted/result';

/**
 * Test suite for epicenter initialization with topological sort
 * Tests various workspace dependency scenarios to ensure correct initialization order
 */
describe('createEpicenterClient - Topological Sort', () => {
	/**
	 * Track initialization order to verify topological sorting
	 */
	const initOrder: string[] = [];

	test('linear dependency chain: A -> B -> C', async () => {
		initOrder.length = 0;

		// Create workspaces: C depends on B, B depends on A
		const workspaceA = defineEpicenter({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-a');
			},
		});
		const workspaceB = defineEpicenter({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-b');
			},
		});

		// Flat dependency resolution: C must declare ALL transitive dependencies
		// C depends on B (direct), and A (transitive through B)
		const workspaceC = defineEpicenter({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			workspaces: [workspaceA, workspaceB], // Hoisted/flat dependencies
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-c');
			},
		});

		// Initialize workspace C
		await createEpicenterClient(workspaceC);

		// Verify initialization order: A -> B -> C
		expect(initOrder).toEqual(['workspace-a', 'workspace-b', 'workspace-c']);
	});

	test('diamond dependency: C depends on A and B, both depend on D', async () => {
		initOrder.length = 0;

		// Create diamond dependency structure
		// D is the base, A and B depend on D, C depends on both A and B
		const workspaceD = defineEpicenter({
			id: 'workspace-d',
			name: 'workspace-d',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-d');
			},
		});
		const workspaceA = defineEpicenter({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			workspaces: [workspaceD],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-a');
			},
		});
		const workspaceB = defineEpicenter({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			workspaces: [workspaceD],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-b');
			},
		});

		// Flat dependency resolution: C must declare ALL transitive dependencies
		// C depends on A, B (direct), and D (transitive through A and B)
		const workspaceC = defineEpicenter({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			workspaces: [workspaceD, workspaceA, workspaceB], // All hoisted
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-c');
			},
		});

		await createEpicenterClient(workspaceC);

		// D must be initialized first
		expect(initOrder[0]).toBe('workspace-d');

		// A and B can be in any order (both depend only on D)
		expect(initOrder.slice(1, 3)).toContain('workspace-a');
		expect(initOrder.slice(1, 3)).toContain('workspace-b');

		// C must be initialized last
		expect(initOrder[3]).toBe('workspace-c');
	});

	test('multiple independent workspaces', async () => {
		initOrder.length = 0;

		// Create three independent workspaces (no dependencies)
		const workspaceX = defineEpicenter({
			id: 'workspace-x',
			name: 'workspace-x',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-x');
			},
		});
		const workspaceY = defineEpicenter({
			id: 'workspace-y',
			name: 'workspace-y',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-y');
			},
		});
		const workspaceZ = defineEpicenter({
			id: 'workspace-z',
			name: 'workspace-z',
			version: 1,
			workspaces: [workspaceX, workspaceY],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-z');
			},
		});

		await createEpicenterClient(workspaceZ);

		// X and Y can be in any order (both have no dependencies)
		expect(initOrder.slice(0, 2)).toContain('workspace-x');
		expect(initOrder.slice(0, 2)).toContain('workspace-y');

		// Z must be initialized last
		expect(initOrder[2]).toBe('workspace-z');
	});

	test('version resolution: highest version wins', async () => {
		initOrder.length = 0;

		// Create workspace A with version 1
		const workspaceA_v1 = defineEpicenter({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			workspaces: [],
			schema: {
				items: {
					id: id(),
					value: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-a-v1');
			},
		});

		// Create workspace A with version 3 (higher)
		const workspaceA_v3 = defineEpicenter({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 3,
			workspaces: [],
			schema: {
				items: {
					id: id(),
					value: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-a-v3');
			},
		});

		// B depends on v1, C depends on v3
		const workspaceB = defineEpicenter({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			workspaces: [workspaceA_v1],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-b');
			},
		});
		const workspaceC = defineEpicenter({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			workspaces: [workspaceA_v3],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-c');
			},
		});

		// Root depends on both B and C (flat resolution: include ALL transitive deps)
		const root = defineEpicenter({
			id: 'root',
			name: 'root',
			version: 1,
			workspaces: [workspaceA_v1, workspaceA_v3, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: ({ workspaces }) => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('root');
			},
		});

		await createEpicenterClient(root);

		// Should only initialize v3 (highest version)
		expect(initOrder).toContain('workspace-a-v3');
		expect(initOrder).not.toContain('workspace-a-v1');

		// Verify v3 is initialized before B and C
		const v3Index = initOrder.indexOf('workspace-a-v3');
		const bIndex = initOrder.indexOf('workspace-b');
		const cIndex = initOrder.indexOf('workspace-c');
		expect(v3Index).toBeLessThan(bIndex);
		expect(v3Index).toBeLessThan(cIndex);
	});

	test('circular dependency detection', async () => {
		// Create circular dependency: A -> B -> A
		const workspaceA: any = {
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
		};

		const workspaceB: any = {
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
		};

		// Create circular reference
		workspaceA.workspaces = [workspaceB];

		// Should throw error about circular dependency
		await expect(createEpicenterClient(workspaceA)).rejects.toThrow(
			/Circular/,
		);
	});

	test('complex dependency graph with multiple levels', async () => {
		initOrder.length = 0;

		// Create a more complex dependency structure:
		//       F
		//      / \
		//     D   E
		//     |\ /|
		//     | X |
		//     |/ \|
		//     B   C
		//      \ /
		//       A

		const workspaceA = defineEpicenter({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-a');
			},
		});
		const workspaceB = defineEpicenter({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-b');
			},
		});
		const workspaceC = defineEpicenter({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-c');
			},
		});
		const workspaceD = defineEpicenter({
			id: 'workspace-d',
			name: 'workspace-d',
			version: 1,
			workspaces: [workspaceA, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-d');
			},
		});
		const workspaceE = defineEpicenter({
			id: 'workspace-e',
			name: 'workspace-e',
			version: 1,
			workspaces: [workspaceA, workspaceB, workspaceC],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-e');
			},
		});

		// F must declare ALL transitive dependencies (flat resolution)
		const workspaceF = defineEpicenter({
			id: 'workspace-f',
			name: 'workspace-f',
			version: 1,
			workspaces: [
				workspaceA,
				workspaceB,
				workspaceC,
				workspaceD,
				workspaceE,
			],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({}),
			setupYDoc: (ydoc) => {
				initOrder.push('workspace-f');
			},
		});

		await createEpicenterClient(workspaceF);

		// A must be first (no dependencies)
		expect(initOrder[0]).toBe('workspace-a');

		// B and C can be in any order (both depend only on A)
		const aIndex = initOrder.indexOf('workspace-a');
		const bIndex = initOrder.indexOf('workspace-b');
		const cIndex = initOrder.indexOf('workspace-c');
		expect(bIndex).toBeGreaterThan(aIndex);
		expect(cIndex).toBeGreaterThan(aIndex);

		// D and E must come after both B and C
		const dIndex = initOrder.indexOf('workspace-d');
		const eIndex = initOrder.indexOf('workspace-e');
		expect(dIndex).toBeGreaterThan(bIndex);
		expect(dIndex).toBeGreaterThan(cIndex);
		expect(eIndex).toBeGreaterThan(bIndex);
		expect(eIndex).toBeGreaterThan(cIndex);

		// F must be last (depends on D and E)
		const fIndex = initOrder.indexOf('workspace-f');
		expect(fIndex).toBeGreaterThan(dIndex);
		expect(fIndex).toBeGreaterThan(eIndex);
		expect(fIndex).toBe(initOrder.length - 1);
	});

	test('workspace can access initialized dependencies', async () => {
		// Create workspace A that exposes an action
		const workspaceA = defineEpicenter({
			id: 'workspace-a',
			name: 'workspaceA',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({
				getValue: defineQuery({
					handler: () => {
						return Ok('value-from-a');
					},
				}),
			}),
		});

		// Create workspace B that depends on A and uses its action
		const workspaceB = defineEpicenter({
			id: 'workspace-b',
			name: 'workspaceB',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: ({ workspaces }) => ({
				getValueFromA: defineQuery({
					handler: async () => {
						// Access workspace A's action
						const result = await workspaces.workspaceA.getValue();
						return result;
					},
				}),
			}),
		});

		const client = await createEpicenterClient(workspaceB);

		// All workspaces are exposed by name (flat/hoisted model)
		expect(client.workspaceA).toBeDefined();
		expect(client.workspaceB).toBeDefined();

		// Can call B's action which internally calls A
		const result = await client.workspaceB.getValueFromA();
		expect(result.data).toBe('value-from-a');

		client.destroy();
	});

	test('exposes all workspaces by name, including dependencies', async () => {
		const workspaceA = defineEpicenter({
			id: 'a',
			name: 'workspaceA',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({
				getValueFromA: defineQuery({
					handler: () => Ok('value-from-a'),
				}),
			}),
		});

		const workspaceB = defineEpicenter({
			id: 'b',
			name: 'workspaceB',
			version: 1,
			workspaces: [workspaceA],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: ({ workspaces }) => ({
				getValueFromB: defineQuery({
					handler: () => Ok('value-from-b'),
				}),
				callA: defineQuery({
					handler: async () => workspaces.workspaceA.getValueFromA(),
				}),
			}),
		});

		const client = await createEpicenterClient(workspaceB);

		// All workspaces ARE exposed by name (transparent dependencies)
		expect(client.workspaceA).toBeDefined();
		expect(client.workspaceB).toBeDefined();

		// Can access both workspaces' actions
		expect(client.workspaceA.getValueFromA).toBeDefined();
		expect(client.workspaceB.getValueFromB).toBeDefined();
		expect(client.workspaceB.callA).toBeDefined();

		// Can call A's actions directly
		const resultA = await client.workspaceA.getValueFromA();
		expect(resultA.data).toBe('value-from-a');

		// Can call B's action that internally calls A
		const resultB = await client.workspaceB.callA();
		expect(resultB.data).toBe('value-from-a');

		client.destroy();
	});

	test('multiple workspaces - all exposed by name', async () => {
		const workspaceA = defineEpicenter({
			id: 'a',
			name: 'workspaceA',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-a'),
				}),
			}),
		});

		const workspaceB = defineEpicenter({
			id: 'b',
			name: 'workspaceB',
			version: 1,
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: () => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-b'),
				}),
			}),
		});

		const workspaceC = defineEpicenter({
			id: 'c',
			name: 'workspaceC',
			version: 1,
			workspaces: [workspaceA, workspaceB],
			schema: {
				items: {
					id: id(),
					name: text(),
				},
			},
			indexes: () => ({}),
			actions: ({ workspaces }) => ({
				getValue: defineQuery({
					handler: () => Ok('value-from-c'),
				}),
				getFromA: defineQuery({
					handler: async () => workspaces.workspaceA.getValue(),
				}),
				getFromB: defineQuery({
					handler: async () => workspaces.workspaceB.getValue(),
				}),
			}),
		});

		const client = await createEpicenterClient(workspaceC);

		// All workspaces are exposed by name
		expect(client.workspaceA).toBeDefined();
		expect(client.workspaceB).toBeDefined();
		expect(client.workspaceC).toBeDefined();

		// Can access all workspace actions
		expect(client.workspaceC.getValue).toBeDefined();
		expect(client.workspaceC.getFromA).toBeDefined();
		expect(client.workspaceC.getFromB).toBeDefined();

		// Can call C's actions that access A and B
		const resultA = await client.workspaceC.getFromA();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.workspaceC.getFromB();
		expect(resultB.data).toBe('value-from-b');

		// Can also call A and B directly
		const directA = await client.workspaceA.getValue();
		expect(directA.data).toBe('value-from-a');

		const directB = await client.workspaceB.getValue();
		expect(directB.data).toBe('value-from-b');

		client.destroy();
	});
});
