import { Type } from 'typebox';

const schema = Type.Object({
	title: Type.String(),
	content: Type.Optional(Type.String()),
	category: Type.Union([
		Type.Literal('tech'),
		Type.Literal('personal'),
		Type.Literal('tutorial'),
	]),
});

console.log('Schema:', schema);
console.log('Schema properties:', schema.properties);
console.log('Schema type:', schema.type);
