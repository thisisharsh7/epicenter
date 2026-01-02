import { describe, expect, test } from 'bun:test';
import { createClient, defineWorkspace, id, text } from '../index.node';

/**
 * Action Execution Tests
 *
 * SKIPPED: Action execution tests require the contract-handler separation migration to be complete.
 *
 * The tests use the OLD pattern where `defineQuery` accepts `handler`.
 * With the new architecture:
 * - `defineQuery`/`defineMutation` are contract-only (input, output, description)
 * - Handlers are bound via `.withHandlers()` on the workspace contract
 *
 * Re-enable when `.withHandlers()` is implemented.
 * See: specs/20260101T014845-contract-handler-separation.md
 */
describe.skip('Action Execution (PENDING: contract-handler separation)', () => {
	test('should call workspace actions', () => {});
});

/**
 * Epicenter Error Handling Tests
 *
 * These tests verify workspace registration and dependency resolution,
 * which don't require handler execution.
 */
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

/**
 * Dependency Resolution Tests
 *
 * These tests verify workspace dependency management.
 * Since they don't execute actions (just check workspace structure),
 * they work with the contract-only architecture.
 */
describe('Dependency Resolution', () => {
	const createTestWorkspace = (workspaceId: string, deps: unknown[] = []) => {
		return defineWorkspace({
			id: workspaceId,
			dependencies: deps as never[],
			tables: {
				items: {
					id: id(),
					value: text(),
				},
			},
			providers: {},
			actions: () => ({}),
		});
	};

	test('exposes all workspaces in the workspaces array by id', async () => {
		const workspaceA = createTestWorkspace('a');
		const workspaceB = createTestWorkspace('b', [workspaceA]);

		await using client = await createClient([workspaceA, workspaceB]);

		expect(client.a).toBeDefined();
		expect(client.b).toBeDefined();
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
	});
});
