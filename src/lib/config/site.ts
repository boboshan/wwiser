/**
 * Site configuration
 * Centralized config for site metadata, navigation, and SEO defaults
 */

export const siteConfig = {
	name: 'Wwiser',
	tagline: 'Modern Wwise utilities',
	title: 'Wwiser - Modern Wwise utilities',
	description:
		'A collection of productivity tools for Wwise sound designers. Wrap objects, calculate volumes, batch rename, and explore WAAPI - all in your browser.',
	url: 'https://wwiser.dev',
	author: 'bbs',
	version: '0.0.1',
	keywords: [
		'wwise',
		'waapi',
		'audiokinetic',
		'sound design',
		'game audio',
		'audio tools',
		'wwise tools'
	],
	social: {
		github: 'https://github.com/bbs/wwiser'
	}
} as const;

export interface NavItem {
	id: string;
	name: string;
	description: string;
	icon: 'package' | 'volume' | 'edit' | 'terminal' | 'settings';
	href: string;
}

export const navigation: NavItem[] = [
	{
		id: 'wrap',
		name: 'Wrap',
		description: 'Create parent containers',
		icon: 'package',
		href: '/wrap'
	},
	{
		id: 'volume',
		name: 'Effective Volume',
		description: 'Calculate cumulative volume',
		icon: 'volume',
		href: '/volume'
	}
];

export const explore: NavItem = {
	id: 'explore',
	name: 'WAAPI Explorer',
	description: 'Learn and test WAAPI',
	icon: 'terminal',
	href: '/explore'
};

/**
 * SEO metadata for each page
 */
export const pageSeo: Record<string, { title: string; description: string }> = {
	explore: {
		title: 'WAAPI Explorer',
		description:
			'Interactive WAAPI explorer for Wwise. Test functions, subscribe to events, and learn the Wwise Authoring API in real-time.'
	},
	wrap: {
		title: 'Wrap Objects',
		description:
			'Quickly wrap selected Wwise objects in parent containers. Automatically group by naming patterns and create Random, Sequence, or Switch containers.'
	},
	volume: {
		title: 'Effective Volume Calculator',
		description:
			'Calculate the final output volume of Wwise objects including all hierarchy and bus chain contributions. Visualize volume attenuation paths.'
	},
	rename: {
		title: 'Batch Rename',
		description:
			'Batch rename multiple Wwise objects with powerful pattern matching. Use regex, find/replace, and preview changes before applying.'
	}
};

/**
 * Get full page title
 */
export function getPageTitle(pageId?: string): string {
	if (!pageId || !pageSeo[pageId]) {
		return siteConfig.title;
	}
	return `${pageSeo[pageId].title} | ${siteConfig.name}`;
}

/**
 * Get page description
 */
export function getPageDescription(pageId?: string): string {
	if (!pageId || !pageSeo[pageId]) {
		return siteConfig.description;
	}
	return pageSeo[pageId].description;
}
