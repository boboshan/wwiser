/**
 * Shared Wwise constants
 * Centralized lookup tables and configuration used across multiple tool pages
 */

import type { SelectItem } from '$lib/components/select.svelte';
import type { ActionType, ContainerType } from './types';

// ── Type display names ──────────────────────────────────────────────
// Maps PascalCase Wwise type names to human-readable labels

export const TYPE_DISPLAY_NAMES: Record<string, string> = {
	ActorMixer: 'Actor-Mixer',
	BlendContainer: 'Blend Container',
	RandomSequenceContainer: 'Random Sequence',
	SwitchContainer: 'Switch Container',
	AuxBus: 'Aux Bus',
	WorkUnit: 'Work Unit',
	SoundBank: 'Sound Bank',
	GameParameter: 'Game Parameter',
	StateGroup: 'State Group',
	SwitchGroup: 'Switch Group',
	AudioDevice: 'Audio Device',
	ControlSurfaceBinding: 'Control Surface Binding',
	ControlSurfaceSession: 'Control Surface Session',
	ModulatorLfo: 'Modulator LFO',
	ModulatorEnvelope: 'Modulator Envelope',
	ModulatorTime: 'Modulator Time'
};

/** Get a human-readable display name for a Wwise object type */
export function getTypeDisplayName(type: string): string {
	return TYPE_DISPLAY_NAMES[type] ?? type;
}

// ── Container types ─────────────────────────────────────────────────

export const CONTAINER_TYPES: readonly { value: ContainerType; label: string }[] = [
	{ value: 'ActorMixer', label: 'Actor-Mixer' },
	{ value: 'BlendContainer', label: 'Blend Container' },
	{ value: 'RandomSequenceContainer', label: 'Random Container' },
	{ value: 'SwitchContainer', label: 'Switch Container' },
	{ value: 'Folder', label: 'Folder' },
	{ value: 'WorkUnit', label: 'Work Unit' }
];

// ── WAAPI conflict resolution options ───────────────────────────────

export const CONFLICT_RESOLUTION_ITEMS: SelectItem[] = [
	{ value: 'rename', label: 'Rename (auto-suffix)' },
	{ value: 'replace', label: 'Replace existing' },
	{ value: 'fail', label: 'Fail on conflict' },
	{ value: 'merge', label: 'Merge' }
];

// ── Event action types ──────────────────────────────────────────────

export const ACTION_TYPES: SelectItem[] = [
	{ value: 'Play', label: 'Play' },
	{ value: 'Stop', label: 'Stop' },
	{ value: 'Pause', label: 'Pause' },
	{ value: 'Resume', label: 'Resume' },
	{ value: 'Break', label: 'Break' },
	{ value: 'Seek', label: 'Seek' },
	{ value: 'SetSwitch', label: 'Set Switch' },
	{ value: 'SetState', label: 'Set State' },
	{ value: 'SetGameParameter', label: 'Set Game Parameter' },
	{ value: 'ResetPlaylist', label: 'Reset Playlist' },
	{ value: 'EnableBypass', label: 'Enable Bypass' },
	{ value: 'DisableBypass', label: 'Disable Bypass' },
	{ value: 'ResetBypassEffect', label: 'Reset Bypass Effect' },
	{ value: 'Release', label: 'Release Envelope' },
	{ value: 'PostEvent', label: 'Post Event' },
	{ value: 'StopAll', label: 'Stop All' }
];

/** Actions that need a target object, with a description of the target type */
export const NEEDS_TARGET: Record<string, string> = {
	Play: 'Sound/Container',
	Stop: 'Sound/Container',
	Pause: 'Sound/Container',
	Resume: 'Sound/Container',
	Break: 'Sound/Container',
	Seek: 'Sound/Container',
	SetSwitch: 'Switch',
	SetState: 'State',
	SetGameParameter: 'GameParameter',
	ResetPlaylist: 'Sound/Container',
	EnableBypass: 'Sound/Container',
	DisableBypass: 'Sound/Container',
	ResetBypassEffect: 'Sound/Container',
	Release: 'Sound/Container',
	PostEvent: 'Event'
};

/** Actions that don't need any target */
export const NO_TARGET_ACTIONS = new Set<ActionType>(['StopAll']);

/**
 * Map ActionType name → Wwise ActionType property integer value
 * Values from: https://www.audiokinetic.com/en/public-library/2025.1.5_9095/?source=SDK&id=wwiseobject_action.html
 */
export function getActionTypeId(action: ActionType): number {
	const map: Record<ActionType, number> = {
		Play: 1, // /Play
		Stop: 2, // /Stop/Stop
		StopAll: 3, // /Stop/Stop All
		Pause: 7, // /Pause/Pause
		Resume: 9, // /Pause/Resume
		Break: 34, // /Break
		Seek: 36, // /Seek/Seek
		SetSwitch: 23, // /Set Switch
		SetState: 22, // /States/Set State
		SetGameParameter: 38, // /Game Parameter/Set Game Parameter
		ResetPlaylist: 42, // /Reset Playlist
		EnableBypass: 53, // /Bypass Effect/Set - Bypass All Effects
		DisableBypass: 54, // /Bypass Effect/Reset - Bypass All Effects
		ResetBypassEffect: 56, // /Bypass Effect/Reset - All Effect Bypasses
		Release: 40, // /Release Envelope
		PostEvent: 41 // /Post Event
	};
	return map[action] ?? 1;
}

// ── Wwise type categories ───────────────────────────────────────────
// Types that cannot be wrapped inside containers

export const NON_WRAPPABLE_TYPES: string[] = ['Project'];

/** Types that can only be wrapped with Folder or WorkUnit */
export const FOLDER_ONLY_TYPES = new Set([
	'WorkUnit',
	'Bus',
	'AuxBus',
	'Event',
	'SoundBank',
	'Soundcaster',
	'Query',
	'GameParameter',
	'State',
	'StateGroup',
	'Switch',
	'SwitchGroup',
	'Trigger',
	'Effect',
	'AudioDevice',
	'Conversion',
	'ControlSurfaceBinding',
	'ControlSurfaceSession',
	'Attenuation',
	'ModulatorLfo',
	'ModulatorEnvelope',
	'ModulatorTime',
	'Folder'
]);

/** Container types that can wrap any type */
export const UNIVERSAL_CONTAINERS = new Set<ContainerType>(['Folder', 'WorkUnit']);

// ── Naming rules (wrap tool) ────────────────────────────────────────

export type NamingRule = 'omit_suffix' | 'prefix' | 'same_name' | 'custom_regex';

export const NAMING_RULES = [
	{
		value: 'omit_suffix',
		label: 'Omit Last Suffix',
		description: 'Remove trailing _01, _A, etc.'
	},
	{ value: 'prefix', label: 'Use Prefix', description: 'Use text before first underscore' },
	{ value: 'same_name', label: 'Same Name', description: 'Use the object name as-is' },
	{ value: 'custom_regex', label: 'Custom Regex', description: 'Apply custom regex pattern' }
] as const;
