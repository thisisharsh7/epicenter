import path from 'node:path';
import type {
	CapabilityDir,
	CapabilityPaths,
	EpicenterDir,
	ProjectDir,
} from './types';

export function getEpicenterDir(projectDir: ProjectDir): EpicenterDir {
	return path.join(projectDir, '.epicenter') as EpicenterDir;
}

export function getCapabilityDir(
	epicenterDir: EpicenterDir,
	capabilityId: string,
): CapabilityDir {
	return path.join(epicenterDir, 'capabilities', capabilityId) as CapabilityDir;
}

export function buildCapabilityPaths(
	projectDir: ProjectDir,
	capabilityId: string,
): CapabilityPaths {
	const epicenterDir = getEpicenterDir(projectDir);
	return {
		project: projectDir,
		epicenter: epicenterDir,
		capability: getCapabilityDir(epicenterDir, capabilityId),
	};
}
