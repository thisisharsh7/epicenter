import { describe, test, expect } from 'bun:test';
import { createWorkspaceClient, defineWorkspace } from './workspace';
import { id, text } from './schema';
import { defineQuery } from './actions';
import { Ok } from 'wellcrafted/result';

/**
 * Test suite for workspace initialization with topological sort
 * Tests various dependency scenarios to ensure correct initialization order
 */
describe('createWorkspaceClient - Topological Sort', () => {
	/**
	 * Track initialization order to verify topological sorting
	 */
	const initOrder: string[] = [];

	test('linear dependency chain: A -> B -> C', async () => {
		initOrder.length = 0;

		// Create workspaces: C depends on B, B depends on A
		const workspaceA = defineWorkspace({
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
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
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
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			dependencies: [workspaceA, workspaceB], // Hoisted/flat dependencies
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
		createWorkspaceClient(workspaceC);

		// Verify initialization order: A -> B -> C
		expect(initOrder).toEqual(['workspace-a', 'workspace-b', 'workspace-c']);
	});

	test('diamond dependency: C depends on A and B, both depend on D', async () => {
		initOrder.length = 0;

		// Create diamond dependency structure
		// D is the base, A and B depend on D, C depends on both A and B
		const workspaceD = defineWorkspace({
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
		const workspaceA = defineWorkspace({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			dependencies: [workspaceD],
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
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			dependencies: [workspaceD],
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
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			dependencies: [workspaceD, workspaceA, workspaceB], // All hoisted
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

		createWorkspaceClient(workspaceC);

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
		const workspaceX = defineWorkspace({
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
		const workspaceY = defineWorkspace({
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
		const workspaceZ = defineWorkspace({
			id: 'workspace-z',
			name: 'workspace-z',
			version: 1,
			dependencies: [workspaceX, workspaceY],
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

		createWorkspaceClient(workspaceZ);

		// X and Y can be in any order (both have no dependencies)
		expect(initOrder.slice(0, 2)).toContain('workspace-x');
		expect(initOrder.slice(0, 2)).toContain('workspace-y');

		// Z must be initialized last
		expect(initOrder[2]).toBe('workspace-z');
	});

	test('version resolution: highest version wins', async () => {
		initOrder.length = 0;

		// Create workspace A with version 1
		const workspaceA_v1 = defineWorkspace({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 1,
			dependencies: [],
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
		const workspaceA_v3 = defineWorkspace({
			id: 'workspace-a',
			name: 'workspace-a',
			version: 3,
			dependencies: [],
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
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			dependencies: [workspaceA_v1],
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
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			dependencies: [workspaceA_v3],
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
		const root = defineWorkspace({
			id: 'root',
			name: 'root',
			version: 1,
			dependencies: [workspaceA_v1, workspaceA_v3, workspaceB, workspaceC],
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

		createWorkspaceClient(root);

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
			dependencies: [workspaceA],
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
		workspaceA.dependencies = [workspaceB];

		// Should throw error about circular dependency
		expect(() => createWorkspaceClient(workspaceA)).toThrow(
			/Circular dependency/,
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

		const workspaceA = defineWorkspace({
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
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			name: 'workspace-b',
			version: 1,
			dependencies: [workspaceA],
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
		const workspaceC = defineWorkspace({
			id: 'workspace-c',
			name: 'workspace-c',
			version: 1,
			dependencies: [workspaceA],
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
		const workspaceD = defineWorkspace({
			id: 'workspace-d',
			name: 'workspace-d',
			version: 1,
			dependencies: [workspaceA, workspaceB, workspaceC],
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
		const workspaceE = defineWorkspace({
			id: 'workspace-e',
			name: 'workspace-e',
			version: 1,
			dependencies: [workspaceA, workspaceB, workspaceC],
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
		const workspaceF = defineWorkspace({
			id: 'workspace-f',
			name: 'workspace-f',
			version: 1,
			dependencies: [
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

		createWorkspaceClient(workspaceF);

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
		const workspaceA = defineWorkspace({
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
		const workspaceB = defineWorkspace({
			id: 'workspace-b',
			name: 'workspaceB',
			version: 1,
			dependencies: [workspaceA],
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

		const client = createWorkspaceClient(workspaceB);

		// Verify that B can call A's action
		const result = await client.getValueFromA();
		expect(result.data).toBe('value-from-a');
	});

	test('exposes only root workspace actions, not dependencies', async () => {
		const workspaceA = defineWorkspace({
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

		const workspaceB = defineWorkspace({
			id: 'b',
			name: 'workspaceB',
			version: 1,
			dependencies: [workspaceA],
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

		const client = createWorkspaceClient(workspaceB);

		// Root workspace B's actions ARE exposed
		expect(client.getValueFromB).toBeDefined();
		expect(typeof client.getValueFromB).toBe('function');
		expect(client.callA).toBeDefined();

		// Dependency workspace A's actions are NOT exposed on the client
		expect((client as any).workspaceA).toBeUndefined();

		// But B can call A's actions internally via workspaces parameter
		const result = await client.callA();
		expect(result.data).toBe('value-from-a');

		await client.destroy();
	});

	test('root with multiple dependencies - only root actions exposed', async () => {
		const workspaceA = defineWorkspace({
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

		const workspaceB = defineWorkspace({
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

		const workspaceC = defineWorkspace({
			id: 'c',
			name: 'workspaceC',
			version: 1,
			dependencies: [workspaceA, workspaceB],
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

		const client = createWorkspaceClient(workspaceC);

		// Only C's actions are exposed
		expect(client.getValue).toBeDefined();
		expect(client.getFromA).toBeDefined();
		expect(client.getFromB).toBeDefined();

		// A and B are NOT exposed
		expect((client as any).workspaceA).toBeUndefined();
		expect((client as any).workspaceB).toBeUndefined();

		// But C can access A and B internally
		const resultA = await client.getFromA();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.getFromB();
		expect(resultB.data).toBe('value-from-b');

		await client.destroy();
	});
});
