import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import { boolean, id, integer, select, tags, text, ytext } from '../schema';
import { createEpicenterDb } from './core';

/**
 * Type inference test file for YjsDoc
 * This file tests that generics properly flow through the API
 * Hover over variables to verify types are correctly inferred
 */

describe('YjsDoc Type Inference', () => {
	test('should infer row types from schema', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			posts: {
				id: id(),
				title: text(),
				content: ytext({ nullable: true }),
				tags: tags({ options: ['tech', 'personal', 'work'] }),
				view_count: integer(),
				published: boolean(),
			},
		});

		// Test upsert() - accepts serialized values (strings for ytext, arrays for multi-select)
		doc.posts.upsert({
			id: '1',
			title: 'Test Post',
			content: 'Post content', // string (gets converted to Y.Text internally)
			tags: ['tech'], // array (gets converted to Y.Array internally)
			view_count: 0,
			published: false,
		});

		// Test get() - returns GetResult<Row>
		const result = doc.posts.get({ id: '1' });
		expect(result.status).toBe('valid');

		if (result.status === 'valid') {
			const row = result.row;
			// Verify property access works
			expect(row.id).toBe('1');
			expect(row.title).toBe('Test Post');
			expect(row.view_count).toBe(0);
			expect(row.published).toBe(false);

			// Verify YJS types are properly inferred
			expect(row.content).toBeInstanceOf(Y.Text);
			expect(row.tags).toBeInstanceOf(Y.Array);
		}
	});

	test('should infer types for getAll()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			products: {
				id: id(),
				name: text(),
				price: integer(),
				in_stock: boolean(),
			},
		});

		doc.products.upsertMany({
			rows: [
				{ id: '1', name: 'Widget', price: 1000, in_stock: true },
				{ id: '2', name: 'Gadget', price: 2000, in_stock: false },
			],
		});

		// getAllValid() returns Row[] directly
		const products = doc.products.getAllValid();
		// Expected type: Array<{ id: string; name: string; price: number; in_stock: boolean }>

		expect(products).toHaveLength(2);
	});

	test('should infer predicate parameter types in filter()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			tasks: {
				id: id(),
				title: text(),
				completed: boolean(),
				priority: select({ options: ['low', 'medium', 'high'] }),
			},
		});

		doc.tasks.upsertMany({
			rows: [
				{ id: '1', title: 'Task 1', completed: false, priority: 'high' },
				{ id: '2', title: 'Task 2', completed: true, priority: 'low' },
			],
		});

		// Hover over 'task' parameter to verify inferred type
		// filter() now returns Row[] directly
		const incompleteTasks = doc.tasks.filter((task) => !task.completed);
		// task type should be: { id: string; title: string; completed: boolean; priority: string }

		expect(incompleteTasks).toHaveLength(1);
		expect(incompleteTasks[0]?.title).toBe('Task 1');
	});

	test('should infer predicate parameter types in find()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			items: {
				id: id(),
				name: text(),
				quantity: integer(),
			},
		});

		doc.items.upsertMany({
			rows: [
				{ id: '1', name: 'Item 1', quantity: 5 },
				{ id: '2', name: 'Item 2', quantity: 0 },
			],
		});

		// Hover over 'item' parameter to verify inferred type
		// find() now returns Row | null directly
		const outOfStockItem = doc.items.find((item) => item.quantity === 0);
		// item type should be: { id: string; name: string; quantity: number }

		expect(outOfStockItem).not.toBeNull();
		expect(outOfStockItem?.name).toBe('Item 2');
	});

	test('should infer observer handler parameter types', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			notifications: {
				id: id(),
				message: text(),
				read: boolean(),
			},
		});

		const addedNotifications: Array<{
			id: string;
			message: string;
			read: boolean;
		}> = [];

		// Hover over 'result' parameter to verify inferred type
		const unsubscribe = doc.notifications.observe({
			onAdd: (result) => {
				// result type should be: Result<{ id: string; message: string; read: boolean }, ArkErrors>
				if (result.data) {
					addedNotifications.push(result.data);
				}
			},
			onUpdate: (_result) => {
				// result type should be: Result<{ id: string; message: string; read: boolean }, ArkErrors>
			},
			onDelete: (_id) => {
				// id type should be: string
			},
		});

		doc.notifications.upsert({
			id: '1',
			message: 'Test notification',
			read: false,
		});

		expect(addedNotifications).toHaveLength(1);
		expect(addedNotifications[0]?.message).toBe('Test notification');

		unsubscribe();
	});

	test('should handle nullable YJS types correctly', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			articles: {
				id: id(),
				title: text(),
				description: ytext({ nullable: true }), // Y.Text | null
				content: ytext({ nullable: true }), // Y.Text | null
			},
		});

		// Test with null values
		doc.articles.upsert({
			id: '1',
			title: 'Article without content',
			description: null,
			content: null,
		});

		const article1Result = doc.articles.get({ id: '1' });
		expect(article1Result.status).toBe('valid');
		if (article1Result.status === 'valid') {
			expect(article1Result.row.description).toBeNull();
			expect(article1Result.row.content).toBeNull();
		}

		// Test with string values (automatically converted to Y.Text internally)
		doc.articles.upsert({
			id: '2',
			title: 'Article with content',
			description: 'A short description',
			content: 'Article content',
		});

		const article2Result = doc.articles.get({ id: '2' });
		expect(article2Result.status).toBe('valid');
		if (article2Result.status === 'valid') {
			expect(article2Result.row.description).toBeInstanceOf(Y.Text);
			expect(article2Result.row.content).toBeInstanceOf(Y.Text);
		}
	});

	test('should handle multi-table schemas with proper type inference', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			authors: {
				id: id(),
				name: text(),
				bio: ytext({ nullable: true }),
			},
			books: {
				id: id(),
				author_id: text(),
				title: text(),
				chapters: tags({
					options: ['Chapter 1', 'Chapter 2', 'Chapter 3'],
				}),
				published: boolean(),
			},
		});

		// Test authors table - use plain string (converted to Y.Text internally)
		doc.authors.upsert({
			id: 'author-1',
			name: 'John Doe',
			bio: 'Author bio',
		});

		const authorResult = doc.authors.get({ id: 'author-1' });
		// Hover to verify type: GetResult<{ id: string; name: string; bio: Y.Text | null }>

		// Test books table - use plain array (converted to Y.Array internally)
		doc.books.upsert({
			id: 'book-1',
			author_id: 'author-1',
			title: 'My Book',
			chapters: ['Chapter 1', 'Chapter 2'],
			published: true,
		});

		const bookResult = doc.books.get({ id: 'book-1' });
		// Hover to verify type: GetResult<{ id: string; author_id: string; title: string; chapters: Y.Array<string>; published: boolean }>

		expect(authorResult.status).toBe('valid');
		expect(bookResult.status).toBe('valid');
		if (authorResult.status === 'valid') {
			expect(authorResult.row.name).toBe('John Doe');
		}
		if (bookResult.status === 'valid') {
			expect(bookResult.row.title).toBe('My Book');
		}
	});

	test('should properly type upsertMany with array of rows', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			comments: {
				id: id(),
				text: text(),
				upvotes: integer(),
			},
		});

		// Hover over the array to verify element type
		const commentsToAdd = [
			{ id: '1', text: 'First comment', upvotes: 5 },
			{ id: '2', text: 'Second comment', upvotes: 10 },
		];

		doc.comments.upsertMany({ rows: commentsToAdd });

		const comments = doc.comments.getAllValid();
		expect(comments).toHaveLength(2);
	});

	test('should handle YJS types in complex scenarios', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			documents: {
				id: id(),
				title: text(),
				body: ytext(),
				notes: ytext({ nullable: true }),
				tags: tags({ options: ['tag1', 'tag2'] }),
			},
		});

		// Upsert with plain values (automatically converted to Y.js types internally)
		doc.documents.upsert({
			id: 'doc-1',
			title: 'My Document',
			body: 'Hello World',
			notes: null,
			tags: ['tag1', 'tag2'],
		});

		// Test retrieval and mutations
		const retrievedResult = doc.documents.get({ id: 'doc-1' });
		expect(retrievedResult.status).toBe('valid');

		if (retrievedResult.status === 'valid') {
			const retrieved = retrievedResult.row;
			// These should all be properly typed
			expect(retrieved.body).toBeInstanceOf(Y.Text);
			expect(retrieved.tags).toBeInstanceOf(Y.Array);
			expect(retrieved.notes).toBeNull();

			// Mutations should work because YJS types are passed by reference
			retrieved.tags.push(['tag1']);
			expect(retrieved.tags.length).toBe(3);
		}
	});
});
