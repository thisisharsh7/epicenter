import { describe, test, expect } from 'bun:test';
import { createEpicenterDb } from './core';
import {
	id,
	text,
	ytext,
	yxmlfragment,
	integer,
	boolean,
	select,
	multiSelect,
} from '../core/column-schemas';
import * as Y from 'yjs';

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
				content: yxmlfragment({ nullable: true }),
				tags: multiSelect({ options: ['tech', 'personal', 'work'] as const }),
				viewCount: integer(),
				published: boolean(),
			},
		});

		// Test set() - should require all fields with correct types
		const content = new Y.XmlFragment();
		const tags = new Y.Array<string>();
		tags.push(['tech']);

		doc.tables.posts.insert({
			id: '1',
			title: 'Test Post',
			content: content, // Y.XmlFragment | null
			tags: tags, // Y.Array<string>
			viewCount: 0,
			published: false,
		});

		// Test get() - hover over 'row' to verify inferred type
		const row = doc.tables.posts.get('1');
		// Expected type: { id: string; title: string; content: Y.XmlFragment | null; tags: Y.Array<string>; viewCount: number; published: boolean } | undefined

		if (row) {
			// Verify property access works
			expect(row.id).toBe('1');
			expect(row.title).toBe('Test Post');
			expect(row.viewCount).toBe(0);
			expect(row.published).toBe(false);

			// Verify YJS types are properly inferred
			expect(row.content).toBeInstanceOf(Y.XmlFragment);
			expect(row.tags).toBeInstanceOf(Y.Array);
		}
	});

	test('should infer types for getMany()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			users: {
				id: id(),
				name: text(),
				email: text({ unique: true }),
				age: integer({ nullable: true }),
			},
		});

		doc.tables.users.setMany([
			{ id: '1', name: 'Alice', email: 'alice@example.com', age: 25 },
			{ id: '2', name: 'Bob', email: 'bob@example.com', age: null },
		]);

		// Hover over 'users' to verify array element type
		const users = doc.tables.users.getMany(['1', '2']);
		// Expected type: Array<{ id: string; name: string; email: string; age: number | null }>

		expect(users).toHaveLength(2);
		expect(users[0].name).toBe('Alice');
		expect(users[0].age).toBe(25);
		expect(users[1].age).toBeNull();
	});

	test('should infer types for getAll()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			products: {
				id: id(),
				name: text(),
				price: integer(),
				inStock: boolean(),
			},
		});

		doc.tables.products.setMany([
			{ id: '1', name: 'Widget', price: 1000, inStock: true },
			{ id: '2', name: 'Gadget', price: 2000, inStock: false },
		]);

		// Hover over 'products' to verify array element type
		const products = doc.tables.products.getAll();
		// Expected type: Array<{ id: string; name: string; price: number; inStock: boolean }>

		expect(products).toHaveLength(2);
	});

	test('should infer predicate parameter types in filter()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			tasks: {
				id: id(),
				title: text(),
				completed: boolean(),
				priority: select({ options: ['low', 'medium', 'high'] as const }),
			},
		});

		doc.tables.tasks.setMany([
			{ id: '1', title: 'Task 1', completed: false, priority: 'high' },
			{ id: '2', title: 'Task 2', completed: true, priority: 'low' },
		]);

		// Hover over 'task' parameter to verify inferred type
		const incompleteTasks = doc.tables.tasks.filter((task) => !task.completed);
		// task type should be: { id: string; title: string; completed: boolean; priority: string }

		expect(incompleteTasks).toHaveLength(1);
		expect(incompleteTasks[0].title).toBe('Task 1');
	});

	test('should infer predicate parameter types in find()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			items: {
				id: id(),
				name: text(),
				quantity: integer(),
			},
		});

		doc.tables.items.setMany([
			{ id: '1', name: 'Item 1', quantity: 5 },
			{ id: '2', name: 'Item 2', quantity: 0 },
		]);

		// Hover over 'item' parameter to verify inferred type
		const outOfStock = doc.tables.items.find((item) => item.quantity === 0);
		// item type should be: { id: string; name: string; quantity: number }

		expect(outOfStock).toBeDefined();
		expect(outOfStock?.name).toBe('Item 2');
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

		// Hover over 'data' parameter to verify inferred type
		const unsubscribe = doc.tables.notifications.observe({
			onAdd: (id, data) => {
				// data type should be: { id: string; message: string; read: boolean }
				addedNotifications.push(data);
			},
			onUpdate: (id, data) => {
				// data type should be: { id: string; message: string; read: boolean }
			},
			onDelete: (id) => {
				// id type should be: string
			},
		});

		doc.tables.notifications.set({
			id: '1',
			message: 'Test notification',
			read: false,
		});

		expect(addedNotifications).toHaveLength(1);
		expect(addedNotifications[0].message).toBe('Test notification');

		unsubscribe();
	});

	test('should handle nullable YJS types correctly', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			articles: {
				id: id(),
				title: text(),
				description: ytext({ nullable: true }), // Y.Text | null
				content: yxmlfragment({ nullable: true }), // Y.XmlFragment | null
			},
		});

		// Test with null values
		doc.tables.articles.set({
			id: '1',
			title: 'Article without content',
			description: null,
			content: null,
		});

		const article1 = doc.tables.articles.get('1');
		expect(article1?.description).toBeNull();
		expect(article1?.content).toBeNull();

		// Test with YJS type values
		const description = new Y.Text();
		description.insert(0, 'A short description');
		const content = new Y.XmlFragment();

		doc.tables.articles.set({
			id: '2',
			title: 'Article with content',
			description: description,
			content: content,
		});

		const article2 = doc.tables.articles.get('2');
		expect(article2?.description).toBeInstanceOf(Y.Text);
		expect(article2?.content).toBeInstanceOf(Y.XmlFragment);
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
				authorId: text(),
				title: text(),
				chapters: multiSelect({ options: [] }),
				published: boolean(),
			},
		});

		// Test authors table
		const authorBio = new Y.Text();
		authorBio.insert(0, 'Author bio');

		doc.tables.authors.set({
			id: 'author-1',
			name: 'John Doe',
			bio: authorBio,
		});

		const author = doc.tables.authors.get('author-1');
		// Hover to verify type: { id: string; name: string; bio: Y.Text | null } | undefined

		// Test books table
		const chapters = new Y.Array<string>();
		chapters.push(['Chapter 1', 'Chapter 2']);

		doc.tables.books.set({
			id: 'book-1',
			authorId: 'author-1',
			title: 'My Book',
			chapters: chapters,
			published: true,
		});

		const book = doc.tables.books.get('book-1');
		// Hover to verify type: { id: string; authorId: string; title: string; chapters: Y.Array<string>; published: boolean } | undefined

		expect(author?.name).toBe('John Doe');
		expect(book?.title).toBe('My Book');
	});

	test('should properly type setMany with array of rows', () => {
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

		doc.tables.comments.setMany(commentsToAdd);

		const comments = doc.tables.comments.getAll();
		expect(comments).toHaveLength(2);
	});

	test('should handle YJS types in complex scenarios', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			documents: {
				id: id(),
				title: text(),
				body: yxmlfragment(),
				notes: ytext({ nullable: true }),
				tags: multiSelect({ options: ['tag1', 'tag2'] as const }),
			},
		});

		// Create YJS instances
		const body = new Y.XmlFragment();
		const paragraph = new Y.XmlElement('p');
		const textNode = new Y.XmlText();
		textNode.insert(0, 'Hello World');
		paragraph.insert(0, [textNode]);
		body.insert(0, [paragraph]);

		const tags = new Y.Array<string>();
		tags.push(['tag1', 'tag2']);

		doc.tables.documents.set({
			id: 'doc-1',
			title: 'My Document',
			body: body,
			notes: null,
			tags: tags,
		});

		// Test retrieval and mutations
		const retrieved = doc.tables.documents.get('doc-1');

		if (retrieved) {
			// These should all be properly typed
			expect(retrieved.body).toBeInstanceOf(Y.XmlFragment);
			expect(retrieved.tags).toBeInstanceOf(Y.Array);
			expect(retrieved.notes).toBeNull();

			// Mutations should work because YJS types are passed by reference
			retrieved.tags.push(['tag1']);
			expect(retrieved.tags.length).toBe(3);
		}
	});
});
