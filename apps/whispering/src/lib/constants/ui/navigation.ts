/**
 * Navigation surface visibility options.
 *
 * Controls which navigation UI elements are visible in the app.
 *
 * - `sidebar`: The collapsible vertical sidebar on the left side of the screen.
 *   Contains navigation links, quick actions, and app branding. Can be toggled
 *   between expanded and icon-only modes.
 *
 * - `nav-items`: The inline navigation items (NavItems component). Appears in
 *   two locations: as a header bar on config/settings pages, and as centered
 *   navigation on the home page. Contains links to recordings, transformations,
 *   settings, theme toggle, and other quick actions.
 */
export const NAVIGATION_SURFACES = ['sidebar', 'nav-items'] as const;

export type NavigationSurface = (typeof NAVIGATION_SURFACES)[number];

export const NAVIGATION_SURFACE_OPTIONS = [
	{ label: 'Sidebar', value: 'sidebar' },
	{ label: 'Navigation Items', value: 'nav-items' },
] as const satisfies readonly { label: string; value: NavigationSurface }[];
