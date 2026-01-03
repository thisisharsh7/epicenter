import type { ActionContract } from '../actions';

export type ActionInfo = {
	workspaceId: string;
	actionPath: string[];
	action: ActionContract;
};
