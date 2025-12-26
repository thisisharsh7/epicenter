import path from 'node:path';
import type {
	EpicenterDir,
	ProjectDir,
	ProviderDir,
	ProviderPaths,
} from './types';

export function getEpicenterDir(projectDir: ProjectDir): EpicenterDir {
	return path.join(projectDir, '.epicenter') as EpicenterDir;
}

export function getProviderDir(
	epicenterDir: EpicenterDir,
	providerId: string,
): ProviderDir {
	return path.join(epicenterDir, 'providers', providerId) as ProviderDir;
}

export function buildProviderPaths(
	projectDir: ProjectDir,
	providerId: string,
): ProviderPaths {
	const epicenterDir = getEpicenterDir(projectDir);
	return {
		project: projectDir,
		epicenter: epicenterDir,
		provider: getProviderDir(epicenterDir, providerId),
	};
}
