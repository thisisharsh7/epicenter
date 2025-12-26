import { describe, expect, test } from 'bun:test';
import { Ok } from 'wellcrafted/result';
import {
	createClient,
	defineQuery,
	defineWorkspace,
	id,
	text,
} from '../index.node';

describe('Epicenter Error Handling', () => {
	test('should throw on duplicate workspace IDs', () => {
		const workspace1 = defineWorkspace({
			id: 'duplicate',
			tables: { items: { id: id(), value: text() } },
			providers: {},
			actions: () => ({}),
		});

		const workspace2 = defineWorkspace({
			id: 'duplicate',
			tables: { items: { id: id(), value: text() } },
			providers: {},
			actions: () => ({}),
		});

		expect(() => createClient([workspace1, workspace2])).toThrow(
			'Duplicate workspace IDs detected',
		);
	});
});

describe('Action Exposure and Dependency Resolution', () => {
	const createTestWorkspace = (workspaceId: string, deps: any[] = []) => {
		return defineWorkspace({
			id: workspaceId,
			dependencies: deps,
			tables: {
				items: {
					id: id(),
					value: text(),
				},
			},
			providers: {},
			actions: ({ workspaces }) => ({
				getValue: defineQuery({
					handler: () => Ok(`value-from-${workspaceId}`),
				}),
				...(deps.length > 0
					? {
							getValueFromDependency: defineQuery({
								handler: async () => {
									const depId = deps[0].id;
									const result = await (workspaces as any)[depId].getValue();
									return result;
								},
							}),
						}
					: {}),
			}),
		});
	};

	test('exposes all workspaces in the workspaces array by id', async () => {
		const workspaceA = createTestWorkspace('a');
		const workspaceB = createTestWorkspace('b', [workspaceA]);

		await using client = await createClient([workspaceA, workspaceB]);

		expect(client.a).toBeDefined();
		expect(client.b).toBeDefined();

		expect(client.a?.getValue).toBeDefined();
		expect(client.b?.getValue).toBeDefined();
		expect(client.b?.getValueFromDependency).toBeDefined();

		const resultA = await client.a!.getValue();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.b!.getValue();
		expect(resultB.data).toBe('value-from-b');
	});

	test('requires all transitive dependencies in workspaces array (flat/hoisted)', () => {
		const workspaceA = createTestWorkspace('a');
		const workspaceB = createTestWorkspace('b', [workspaceA]);
		const workspaceC = createTestWorkspace('c', [workspaceA, workspaceB]);

		expect(() => createClient([workspaceB, workspaceC])).toThrow(
			/Missing dependency.*"a"/,
		);
	});

	test('flat/hoisted model: all dependencies must be explicitly listed', async () => {
		const workspaceA = createTestWorkspace('a');
		const workspaceB = createTestWorkspace('b', [workspaceA]);
		const workspaceC = createTestWorkspace('c', [workspaceA, workspaceB]);

		await using client = await createClient([
			workspaceA,
			workspaceB,
			workspaceC,
		]);

		expect(client.a).toBeDefined();
		expect(client.b).toBeDefined();
		expect(client.c).toBeDefined();

		const resultA = await client.a!.getValue();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.b!.getValueFromDependency!();
		expect(resultB.data).toBe('value-from-a');
	});

	test('multiple workspaces with no dependencies - all exposed', async () => {
		const workspaceA = createTestWorkspace('a');
		const workspaceB = createTestWorkspace('b');
		const workspaceC = createTestWorkspace('c');

		await using client = await createClient([
			workspaceA,
			workspaceB,
			workspaceC,
		]);

		expect(client.a).toBeDefined();
		expect(client.b).toBeDefined();
		expect(client.c).toBeDefined();

		const resultA = await client.a!.getValue();
		expect(resultA.data).toBe('value-from-a');

		const resultB = await client.b!.getValue();
		expect(resultB.data).toBe('value-from-b');

		const resultC = await client.c!.getValue();
		expect(resultC.data).toBe('value-from-c');
	});
});
