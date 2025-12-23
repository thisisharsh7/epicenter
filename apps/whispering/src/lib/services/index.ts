// Re-export everything from desktop and isomorphic subfolders
// This allows imports like: import { desktopServices, services } from '$lib/services'
export * from './desktop';
export * from './isomorphic';

// Re-export shared types from the root types file
export * from './types';
