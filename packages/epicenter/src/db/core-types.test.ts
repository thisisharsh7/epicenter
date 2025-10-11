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
				tags: multiSelect({ options: ['tech', 'personal', 'work'] }),
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

		// Test get() - hover over 'result' to verify inferred type
		const result = doc.tables.posts.get('1');
		// Expected type: GetRowResult<{ id: string; title: string; content: Y.XmlFragment | null; tags: Y.Array<string>; viewCount: number; published: boolean }>

		if (result.status === 'valid') {
			const row = result.row;
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

	test('should infer types for getAll()', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			products: {
				id: id(),
				name: text(),
				price: integer(),
				inStock: boolean(),
			},
		});

		doc.tables.products.insertMany([
			{ id: '1', name: 'Widget', price: 1000, inStock: true },
			{ id: '2', name: 'Gadget', price: 2000, inStock: false },
		]);

		// Hover over 'products' to verify array element type
		const { valid: products } = doc.tables.products.getAll();
		// Expected type: Array<{ id: string; name: string; price: number; inStock: boolean }>

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

		doc.tables.tasks.insertMany([
			{ id: '1', title: 'Task 1', completed: false, priority: 'high' },
			{ id: '2', title: 'Task 2', completed: true, priority: 'low' },
		]);

		// Hover over 'task' parameter to verify inferred type
		const { valid: incompleteTasks } = doc.tables.tasks.filter(
			(task) => !task.completed,
		);
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

		doc.tables.items.insertMany([
			{ id: '1', name: 'Item 1', quantity: 5 },
			{ id: '2', name: 'Item 2', quantity: 0 },
		]);

		// Hover over 'item' parameter to verify inferred type
		const outOfStockResult = doc.tables.items.find(
			(item) => item.quantity === 0,
		);
		// item type should be: { id: string; name: string; quantity: number }

		expect(outOfStockResult.status).toBe('valid');
		if (outOfStockResult.status === 'valid') {
			expect(outOfStockResult.row.name).toBe('Item 2');
		}
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

		doc.tables.notifications.insert({
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
		doc.tables.articles.insert({
			id: '1',
			title: 'Article without content',
			description: null,
			content: null,
		});

		const article1Result = doc.tables.articles.get('1');
		expect(article1Result.status).toBe('valid');
		if (article1Result.status === 'valid') {
			expect(article1Result.row.description).toBeNull();
			expect(article1Result.row.content).toBeNull();
		}

		// Test with YJS type values
		const description = new Y.Text();
		description.insert(0, 'A short description');
		const content = new Y.XmlFragment();

		doc.tables.articles.insert({
			id: '2',
			title: 'Article with content',
			description: description,
			content: content,
		});

		const article2Result = doc.tables.articles.get('2');
		if (article2Result.status === 'valid') {
			expect(article2Result.row.description).toBeInstanceOf(Y.Text);
			expect(article2Result.row.content).toBeInstanceOf(Y.XmlFragment);
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
				authorId: text(),
				title: text(),
				chapters: multiSelect({
					options: ['Chapter 1', 'Chapter 2', 'Chapter 3'],
				}),
				published: boolean(),
			},
		});

		// Test authors table
		const authorBio = new Y.Text();
		authorBio.insert(0, 'Author bio');

		doc.tables.authors.insert({
			id: 'author-1',
			name: 'John Doe',
			bio: authorBio,
		});

		const authorResult = doc.tables.authors.get('author-1');
		// Hover to verify type: GetRowResult<{ id: string; name: string; bio: Y.Text | null }>

		// Test books table
		const chapters = new Y.Array<string>();
		chapters.push(['Chapter 1', 'Chapter 2']);

		doc.tables.books.insert({
			id: 'book-1',
			authorId: 'author-1',
			title: 'My Book',
			chapters: chapters,
			published: true,
		});

		const bookResult = doc.tables.books.get('book-1');
		// Hover to verify type: GetRowResult<{ id: string; authorId: string; title: string; chapters: Y.Array<string>; published: boolean }>

		expect(authorResult.status).toBe('valid');
		expect(bookResult.status).toBe('valid');
		if (authorResult.status === 'valid') {
			expect(authorResult.row.name).toBe('John Doe');
		}
		if (bookResult.status === 'valid') {
			expect(bookResult.row.title).toBe('My Book');
		}
	});

	test('should properly type insertMany with array of rows', () => {
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

		doc.tables.comments.insertMany(commentsToAdd);

		const { valid: comments } = doc.tables.comments.getAll();
		expect(comments).toHaveLength(2);
	});

	test('should handle YJS types in complex scenarios', () => {
		const doc = createEpicenterDb(new Y.Doc({ guid: 'test-workspace' }), {
			documents: {
				id: id(),
				title: text(),
				body: yxmlfragment(),
				notes: ytext({ nullable: true }),
				tags: multiSelect({ options: ['tag1', 'tag2'] }),
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

		doc.tables.documents.insert({
			id: 'doc-1',
			title: 'My Document',
			body: body,
			notes: null,
			tags: tags,
		});

		// Test retrieval and mutations
		const retrievedResult = doc.tables.documents.get('doc-1');

		if (retrievedResult.status === 'valid') {
			const retrieved = retrievedResult.row;
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
