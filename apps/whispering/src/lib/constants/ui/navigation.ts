/**
 * Navigation surface visibility options
 */

export const NAVIGATION_SURFACES = ['sidebar', 'topnav'] as const;

export type NavigationSurface = (typeof NAVIGATION_SURFACES)[number];

export const NAVIGATION_SURFACE_OPTIONS = [
	{ label: 'Sidebar', value: 'sidebar' },
	{ label: 'Top Navigation', value: 'topnav' },
] as const satisfies readonly { label: string; value: NavigationSurface }[];
