// place files you want to import through the `$lib` alias in this folder.

// Re-export site configuration
export * from './config/site';

// Toast
export { toaster } from './components/toast.svelte';

// Wwise shared types & constants
export type {
	WwiseObject,
	AudioSourceInfo,
	ProjectInfo,
	Status,
	ConflictResolution,
	ContainerType,
	ActionType
} from './wwise/types';

export {
	TYPE_DISPLAY_NAMES,
	getTypeDisplayName,
	CONTAINER_TYPES,
	CONFLICT_RESOLUTION_ITEMS,
	ACTION_TYPES,
	NEEDS_TARGET,
	NO_TARGET_ACTIONS,
	getActionTypeId,
	NON_WRAPPABLE_TYPES,
	FOLDER_ONLY_TYPES,
	UNIVERSAL_CONTAINERS,
	NAMING_RULES
} from './wwise/constants';

export type { NamingRule } from './wwise/constants';
