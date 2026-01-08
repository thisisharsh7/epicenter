import { createTaggedError } from 'wellcrafted/error';

type CapabilityErrorContext = {
	tableName?: string;
	rowId?: string;
	filename?: string;
	filePath?: string;
	directory?: string;
	operation?: string;
};

export const { CapabilityError, CapabilityErr } = createTaggedError(
	'CapabilityError',
).withContext<CapabilityErrorContext | undefined>();
export type CapabilityError = ReturnType<typeof CapabilityError>;
