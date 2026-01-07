import type { FieldSchema } from './types';

export function isNullableFieldSchema(
	schema: Pick<FieldSchema, 'type'> & { nullable?: boolean },
): boolean {
	if (schema.type === 'id') return false;
	if (schema.type === 'richtext') return true;
	return schema.nullable === true;
}
