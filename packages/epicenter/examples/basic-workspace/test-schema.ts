import { z } from 'zod';

const schema = z.object({
	title: z.string(),
	content: z.string().optional(),
	category: z.enum(['tech', 'personal', 'tutorial']),
});

console.log('Schema:', schema);
console.log('Schema._def:', schema._def);
console.log('Schema._def.typeName:', schema._def.typeName);
console.log('Schema._def.shape():', schema._def.shape());
