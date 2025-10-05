import { describe, test, expect, beforeEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createEpicenterDbFromDisk } from './desktop';
import { id, text, integer, boolean } from '../core/column-schemas';

const TEST_STORAGE_PATH = './test-data/workspaces';
const TEST_WORKSPACE_ID = 'test-workspace-persistence';

describe('YJS Document Persistence', () => {
	beforeEach(() => {
		// Clean up test data before each test
		if (fs.existsSync(TEST_STORAGE_PATH)) {
			fs.rmSync(TEST_STORAGE_PATH, { recursive: true });
		}
	});

	test('should persist data to disk and reload it', () => {
		// Create document with persistence
		const doc1 = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				users: {
					id: id(),
					name: text(),
					age: integer(),
					active: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		// Insert some data
		doc1.tables.users.insert({
			id: 'user-1',
			name: 'Alice',
			age: 30,
			active: true,
		});

		doc1.tables.users.insert({
			id: 'user-2',
			name: 'Bob',
			age: 25,
			active: false,
		});

		// Verify file was created
		const filePath = path.join(TEST_STORAGE_PATH, `${TEST_WORKSPACE_ID}.yjs`);
		expect(fs.existsSync(filePath)).toBe(true);

		// Create a new document instance (simulating reload)
		const doc2 = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				users: {
					id: id(),
					name: text(),
					age: integer(),
					active: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		// Verify data was loaded from disk
		const users = doc2.tables.users.getAll();
		expect(users).toHaveLength(2);

		const alice = doc2.tables.users.get('user-1');
		expect(alice).toEqual({
			id: 'user-1',
			name: 'Alice',
			age: 30,
			active: true,
		});

		const bob = doc2.tables.users.get('user-2');
		expect(bob).toEqual({
			id: 'user-2',
			name: 'Bob',
			age: 25,
			active: false,
		});
	});

	test('should only initialize tables that do not exist when loading from disk', () => {
		// Create document with one table
		const doc1 = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				todos: {
					id: id(),
					title: text(),
					done: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		doc1.tables.todos.insert({
			id: 'todo-1',
			title: 'Buy groceries',
			done: false,
		});

		// Reload with same schema - should preserve data
		const doc2 = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				todos: {
					id: id(),
					title: text(),
					done: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		const todo = doc2.tables.todos.get('todo-1');
		expect(todo).toEqual({
			id: 'todo-1',
			title: 'Buy groceries',
			done: false,
		});
	});

	test('should handle updates and persist them', () => {
		const doc = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				products: {
					id: id(),
					name: text(),
					price: integer(),
					inStock: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		// Insert initial data
		doc.tables.products.insert({
			id: 'prod-1',
			name: 'Widget',
			price: 100,
			inStock: true,
		});

		// Update the product
		doc.tables.products.update('prod-1', {
			price: 150,
			inStock: false,
		});

		// Reload and verify update was persisted
		const doc2 = createEpicenterDbFromDisk(
			TEST_WORKSPACE_ID,
			{
				products: {
					id: id(),
					name: text(),
					price: integer(),
					inStock: boolean(),
				},
			},
			{
				storagePath: TEST_STORAGE_PATH,
			},
		);

		const product = doc2.tables.products.get('prod-1');
		expect(product).toEqual({
			id: 'prod-1',
			name: 'Widget',
			price: 150,
			inStock: false,
		});
	});
});
