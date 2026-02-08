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
	url: 'https://wwiser.net',
	author: 'bbs',
	version: '0.0.2',
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
		github: 'https://github.com/boboshan/wwiser'
	}
} as const;

export interface NavItem {
	id: string;
	name: string;
	description: string;
	icon: 'package' | 'volume' | 'edit' | 'terminal' | 'settings' | 'git-branch' | 'file-audio';
	href: string;
}

export const navigation: NavItem[] = [
	{
		id: 'wrap',
		name: 'Wrap',
		description: 'Wrap objects in containers with auto-grouping',
		icon: 'package',
		href: '/wrap'
	},
	{
		id: 'assign',
		name: 'Assign',
		description: 'Match children to switches by naming rules',
		icon: 'git-branch',
		href: '/assign'
	},
	{
		id: 'volume',
		name: 'Volume',
		description: 'Calculate effective volume across hierarchy and buses',
		icon: 'volume',
		href: '/volume'
	},
	{
		id: 'rename',
		name: 'Rename',
		description: 'Batch rename objects from a clipboard list',
		icon: 'edit',
		href: '/rename'
	},
	// {
	// 	id: 'source-rename',
	// 	name: 'Source Rename',
	// 	description: 'Rename source audio files referenced by sounds',
	// 	icon: 'file-audio',
	// 	href: '/source-rename'
	// }
];

export const explore: NavItem = {
	id: 'explore',
	name: 'WAAPI Explorer',
	description: 'Call functions, subscribe to topics, and inspect results live',
	icon: 'terminal',
	href: '/explore'
};

/**
 * SEO metadata for each page
 */
export const pageSeo: Record<string, { title: string; description: string }> = {
	home: {
		title: 'Wwiser - Modern Wwise utilities',
		description:
			'A collection of productivity tools for Wwise sound designers. Wrap objects, calculate volumes, batch rename, and explore WAAPI - all in your browser.'
	},
	about: {
		title: 'About',
		description:
			'About Wwiser - a collection of modern productivity tools for Wwise sound designers. Learn more about features and links.'
	},
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
	assign: {
		title: 'Assign Switch Children',
		description:
			'Automatically assign children of switch containers to their corresponding switches based on naming patterns. Configure switch groups and preview assignments before applying.'
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
	},
	'source-rename': {
		title: 'Source Rename',
		description:
			'Rename source audio files of selected Wwise objects. Batch rename the original WAV files referenced by Sound objects.'
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
