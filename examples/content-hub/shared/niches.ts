/**
 * Content niches/audiences for categorizing posts across all platforms.
 *
 * These represent:
 * - Accounts/Brands: personal, epicenter, y-combinator, yale
 * - Audiences: college-students, high-school-students
 * - Topics: coding, productivity, ethics, writing
 */
export const NICHES = [
	'personal',
	'epicenter',
	'y-combinator',
	'yale',
	'college-students',
	'high-school-students',
	'coding',
	'productivity',
	'ethics',
	'writing',
] as const;

export type Niche = (typeof NICHES)[number];
