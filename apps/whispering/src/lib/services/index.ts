import { desktopServices } from './desktop';
import { services } from './isomorphic';

export { desktopServices, services };

// Re-export types from desktop
export type { Accelerator } from './desktop';
// Re-export types and values from isomorphic
export type {
	CommandId,
	RecorderServiceError,
	Recording,
	Transformation,
	TransformationRun,
} from './isomorphic';
export {
	DbServiceErr,
	generateDefaultTransformation,
	generateDefaultTransformationStep,
	OsServiceLive,
} from './isomorphic';

// Re-export types and values from shared types
export type {
	Device,
	DeviceAcquisitionOutcome,
	DeviceIdentifier,
	UpdateStatusMessageFn,
} from './types';
export { asDeviceIdentifier } from './types';
