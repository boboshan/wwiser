/**
 * Shared Wwise type definitions
 * Centralized types used across the connection layer and tool pages
 */

// ── Core object types ───────────────────────────────────────────────

export interface WwiseObject {
	id: string;
	name: string;
	type: string;
	path: string;
	parent?: WwiseObject;
}

export interface AudioSourceInfo {
	id: string;
	name: string;
	type: string;
	path: string;
	originalFilePath: string;
}

export interface ProjectInfo {
	name: string;
	path: string;
	isDirty: boolean;
}

// ── Connection types ────────────────────────────────────────────────

export type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── WAAPI conflict resolution (used in object.copy / object.create) ─

export type ConflictResolution = 'fail' | 'rename' | 'replace' | 'merge';

// ── Container types ─────────────────────────────────────────────────

export type ContainerType =
	| 'ActorMixer'
	| 'BlendContainer'
	| 'RandomSequenceContainer'
	| 'SwitchContainer'
	| 'Folder'
	| 'WorkUnit';

// ── Action types (Event action builder) ─────────────────────────────

export type ActionType =
	| 'Play'
	| 'Stop'
	| 'Pause'
	| 'Resume'
	| 'Break'
	| 'Seek'
	| 'SetSwitch'
	| 'SetState'
	| 'SetGameParameter'
	| 'ResetPlaylist'
	| 'EnableBypass'
	| 'DisableBypass'
	| 'ResetBypassEffect'
	| 'Release'
	| 'PostEvent'
	| 'StopAll';
