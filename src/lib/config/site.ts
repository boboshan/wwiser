/**
 * Site configuration
 * Centralized config for site metadata, navigation, and SEO defaults
 */

import {
	Package,
	FilePen,
	Volume2,
	Terminal,
	GitBranch,
	ListChecks,
	FileHeadphone,
	Settings,
	CopyPlus,
	Activity,
	ListMusic
} from 'lucide-svelte';
import type { SvelteComponent } from 'svelte';
import { env } from '$env/dynamic/public';

export const previewEnabled = env.PUBLIC_PREVIEW_FEATURES === 'true';

export const siteConfig = {
	name: 'Wwiser',
	tagline: 'Modern Wwise utilities',
	title: 'Wwiser - Modern Wwise utilities',
	description:
		'A collection of productivity tools for Wwise sound designers. Wrap objects, calculate volumes, batch rename, and explore WAAPI - all in your browser.',
	url: 'https://wwiser.net',
	author: 'bbs',
	version: '0.0.6',
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

export type NavIcon =
	| 'package'
	| 'volume'
	| 'edit'
	| 'terminal'
	| 'settings'
	| 'git-branch'
	| 'file-audio'
	| 'list-checks'
	| 'copy-plus'
	| 'activity'
	| 'list-music';

export interface NavItem {
	id: string;
	name: string;
	description: string;
	shortDescription: string;
	icon: NavIcon;
	href: string;
	featured?: boolean;
	preview?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const iconMap: Record<NavIcon, typeof SvelteComponent<any>> = {
	package: Package,
	edit: FilePen,
	volume: Volume2,
	terminal: Terminal,
	settings: Settings,
	'git-branch': GitBranch,
	'list-checks': ListChecks,
	'file-audio': FileHeadphone,
	'copy-plus': CopyPlus,
	activity: Activity,
	'list-music': ListMusic
};

export const navigation: NavItem[] = [
	{
		id: 'wrap',
		name: 'Wrap',
		description: 'Wrap objects in containers with auto-grouping',
		shortDescription: 'Wrap in containers',
		icon: 'package',
		href: '/wrap',
		featured: true
	},
	{
		id: 'assign',
		name: 'Assign',
		description: 'Match children to switches by naming rules',
		shortDescription: 'Match to switches',
		icon: 'git-branch',
		href: '/assign',
		featured: true
	},
	{
		id: 'analyze',
		name: 'Analyze',
		description: 'Audit switch assignments — find gaps, conflicts, and health issues',
		shortDescription: 'Switch assignment health',
		icon: 'activity',
		href: '/analyze',
		featured: true
	},
	{
		id: 'fill',
		name: 'Fill',
		description: 'Fill blank switches with selected children',
		shortDescription: 'Fill blank switches',
		icon: 'list-checks',
		href: '/fill'
	},
	{
		id: 'volume',
		name: 'Volume',
		description: 'Calculate effective volume across hierarchy and buses',
		shortDescription: 'Effective volume calc',
		icon: 'volume',
		href: '/volume',
		featured: true
	},
	{
		id: 'rename',
		name: 'Rename',
		description: 'Batch rename objects from a clipboard list',
		shortDescription: 'Batch rename objects',
		icon: 'edit',
		href: '/rename',
		featured: true
	},
	{
		id: 'copy',
		name: 'Copy',
		description: 'Copy selected objects into target containers',
		shortDescription: 'Copy into targets',
		icon: 'copy-plus',
		href: '/copy'
	},
	{
		id: 'source-rename',
		name: 'Source Rename',
		description: 'Rename source audio files referenced by sounds',
		shortDescription: 'Rename source files',
		icon: 'file-audio',
		href: '/source-rename',
		preview: true
	},
	{
		id: 'monitor',
		name: 'Monitor',
		description: 'Jump to any segment in a music playlist to quickly test transitions',
		shortDescription: 'Segment navigator',
		icon: 'list-music',
		href: '/monitor',
		featured: true,
		preview: true
	}
];

/** Navigation items filtered by preview flag — use this in the UI */
export const visibleNavigation = navigation.filter((item) => !item.preview || previewEnabled);

export const explore: NavItem = {
	id: 'explore',
	name: 'WAAPI Explorer',
	description: 'Call functions, subscribe to topics, and inspect results live',
	shortDescription: 'Live WAAPI console',
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
	analyze: {
		title: 'Switch Analysis',
		description:
			'Audit switch container health. Find empty switches, unassigned children, multi-assignments, conflicts, and fix them inline.'
	},
	fill: {
		title: 'Fill Blank Switches',
		description:
			'Fill unassigned switches in switch containers by assigning selected children to every blank switch at once.'
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
	},
	copy: {
		title: 'Copy Objects',
		description:
			'Copy selected Wwise objects into one or more target containers. Select sources, select targets, preview and execute.'
	},
	monitor: {
		title: 'Playlist Monitor',
		description:
			'Jump to any segment in a music playlist to quickly test transitions. Load a playlist container, see all segments, and play any one directly.'
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
