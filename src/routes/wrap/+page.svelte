<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import {
		wwise,
		CONTAINER_TYPES,
		type ContainerType,
		type WwiseObject
	} from '$lib/wwise/connection.svelte';
	import { RefreshCw, Package } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Select from '$lib/components/select.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';

	// Types that cannot be wrapped at all
	const NON_WRAPPABLE_TYPES = ['Project'];

	// Types that can only be wrapped with Folder or WorkUnit (not actor-mixer containers)
	const FOLDER_ONLY_TYPES = new Set([
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

	// Container types that can wrap any type
	const UNIVERSAL_CONTAINERS = new Set(['Folder', 'WorkUnit']);

	// Naming rules
	type NamingRule = 'omit_suffix' | 'prefix' | 'same_name' | 'custom_regex';

	const NAMING_RULES = [
		{
			value: 'omit_suffix',
			label: 'Omit Last Suffix',
			description: 'Remove trailing _01, _A, etc.'
		},
		{ value: 'prefix', label: 'Use Prefix', description: 'Use text before first underscore' },
		{ value: 'same_name', label: 'Same Name', description: 'Use the object name as-is' },
		{ value: 'custom_regex', label: 'Custom Regex', description: 'Apply custom regex pattern' }
	] as const;

	// State
	let containerType = $state<ContainerType>('RandomSequenceContainer');
	let namingRule = $state<NamingRule>('omit_suffix');
	let customRegex = $state('(.+)_\\d+$');
	let customReplacement = $state('$1');
	let selectedObjects = $state<WwiseObject[]>([]);
	let isLoading = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');

	// Convert CONTAINER_TYPES to Select items
	const containerItems = CONTAINER_TYPES.map((t) => ({ label: t.label, value: t.value }));

	// Filter out non-wrappable objects based on selected container type
	const wrappableObjects = $derived(
		selectedObjects.filter((obj) => {
			// Never wrap Project
			if (NON_WRAPPABLE_TYPES.includes(obj.type)) return false;
			// Folder-only types can only be wrapped with universal containers
			if (FOLDER_ONLY_TYPES.has(obj.type)) return UNIVERSAL_CONTAINERS.has(containerType);
			// Audio objects can be wrapped with any container
			return true;
		})
	);
	const skippedObjects = $derived(
		selectedObjects.filter((obj) => {
			if (NON_WRAPPABLE_TYPES.includes(obj.type)) return true;
			if (FOLDER_ONLY_TYPES.has(obj.type)) return !UNIVERSAL_CONTAINERS.has(containerType);
			return false;
		})
	);

	// Generate parent name based on naming rule
	function generateParentName(
		objectName: string,
		rule: NamingRule,
		regex: string,
		replacement: string
	): string {
		switch (rule) {
			case 'omit_suffix': {
				// Remove last _suffix (everything after last underscore)
				const idx = objectName.lastIndexOf('_');
				return idx > 0 ? objectName.substring(0, idx) : objectName;
			}
			case 'prefix': {
				const idx = objectName.indexOf('_');
				return idx > 0 ? objectName.substring(0, idx) : objectName;
			}
			case 'same_name':
				return objectName;
			case 'custom_regex': {
				try {
					const re = new RegExp(regex);
					return objectName.replace(re, replacement);
				} catch {
					return objectName;
				}
			}
			default:
				return objectName;
		}
	}

	// Get derived name considering other objects in the same parent
	// If my name equals another object's derived name, use my name as container
	function getDerivedName(obj: WwiseObject, siblings: WwiseObject[]): string {
		const myDerived = generateParentName(obj.name, namingRule, customRegex, customReplacement);

		// Check if my name is the derived name of any sibling
		for (const sibling of siblings) {
			if (sibling.id !== obj.id) {
				const siblingDerived = generateParentName(
					sibling.name,
					namingRule,
					customRegex,
					customReplacement
				);
				if (siblingDerived === obj.name) {
					// My name is someone else's derived name, use my name as container
					return obj.name;
				}
			}
		}

		return myDerived;
	}

	// Derived: Group objects by parent path AND derived container name
	const groupedByParent = $derived.by(() => {
		const groups = new SvelteMap<string, WwiseObject[]>();

		// First, group by parent path
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const byParentPath = new Map<string, WwiseObject[]>();
		for (const obj of wrappableObjects) {
			const parentPath = obj.path.substring(0, obj.path.lastIndexOf('\\'));
			if (!byParentPath.has(parentPath)) {
				byParentPath.set(parentPath, []);
			}
			byParentPath.get(parentPath)!.push(obj);
		}

		// Then derive names considering siblings
		for (const [parentPath, siblings] of byParentPath) {
			for (const obj of siblings) {
				const derivedName = getDerivedName(obj, siblings);
				const key = `${parentPath}|||${derivedName}`;
				if (!groups.has(key)) {
					groups.set(key, []);
				}
				groups.get(key)!.push(obj);
			}
		}

		return groups;
	});

	// Derived: Preview names for each group
	const previewNames = $derived.by(() => {
		const names = new SvelteMap<string, string>();
		for (const [key] of groupedByParent) {
			const derivedName = key.split('|||')[1];
			names.set(key, derivedName);
		}
		return names;
	});

	function getParentPath(key: string): string {
		return key.split('|||')[0];
	}

	async function refreshSelection() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		isLoading = true;
		statusMessage = 'Fetching selection...';
		statusType = 'info';

		try {
			selectedObjects = await wwise.getSelectedObjects();
			statusMessage = `Found ${selectedObjects.length} selected object(s)`;
			statusType = 'info';
		} catch (error) {
			statusMessage = error instanceof Error ? error.message : 'Failed to get selection';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	async function executeWrap() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		if (selectedObjects.length === 0) {
			statusMessage = 'No objects selected';
			statusType = 'error';
			return;
		}

		isExecuting = true;
		statusMessage = 'Creating parent containers...';
		statusType = 'info';

		try {
			await wwise.beginUndoGroup();

			let createdCount = 0;
			let movedCount = 0;

			for (const [key, objects] of groupedByParent) {
				const parentName = previewNames.get(key) || 'NewContainer';
				const grandparentPath = getParentPath(key);

				const conflictingObj = objects.find((obj) => obj.name === parentName);
				if (conflictingObj) {
					await wwise.renameObject(conflictingObj.id, `${parentName}__temp_rename__`);
				}

				let newContainer;
				try {
					newContainer = await wwise.createObject(
						grandparentPath,
						containerType,
						parentName,
						'fail'
					);
				} catch (createError) {
					// Restore the renamed object before re-throwing
					if (conflictingObj) {
						await wwise.renameObject(conflictingObj.id, parentName);
					}
					throw createError;
				}

				if (newContainer) {
					createdCount++;

					for (const obj of objects) {
						await wwise.moveObject(obj.id, newContainer.id, 'rename');
						movedCount++;
					}

					if (conflictingObj) {
						await wwise.renameObject(conflictingObj.id, parentName);
					}
				} else {
					// Creation failed silently - restore the renamed object
					if (conflictingObj) {
						await wwise.renameObject(conflictingObj.id, parentName);
					}
				}
			}

			await wwise.endUndoGroup('Wrap Objects');

			statusMessage = `Created ${createdCount} container(s), moved ${movedCount} object(s)`;
			statusType = 'success';

			selectedObjects = [];
		} catch (error) {
			await wwise.cancelUndoGroup();
			statusMessage = error instanceof Error ? error.message : 'Wrap operation failed';
			statusType = 'error';
		} finally {
			isExecuting = false;
		}
	}

	const uid = $props.id();
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Create parent containers for selected objects. Objects in different work units will get
			separate containers.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button
				onclick={refreshSelection}
				disabled={!wwise.isConnected || isLoading}
				class="text-sm text-base font-medium px-4 rounded-lg bg-surface-200 flex flex-1 gap-2 h-10 transition-colors items-center justify-center dark:bg-surface-800 hover:bg-surface-300 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed dark:hover:bg-surface-700"
			>
				<RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
				{isLoading ? 'Loading...' : 'Get Selection'}
			</button>
			<button
				onclick={executeWrap}
				disabled={!wwise.isConnected || wrappableObjects.length === 0 || isExecuting}
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			>
				<Package size={16} />
				{isExecuting ? 'Wrapping...' : 'Wrap Objects'}
			</button>
		</div>
	</div>

	<!-- Settings Card -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-5">
		<!-- Naming Rule -->
		<fieldset class="space-y-3">
			<legend class="text-[10px] text-muted tracking-wider font-medium uppercase"
				>Naming Rule</legend
			>
			<div class="gap-2 grid sm:grid-cols-4">
				{#each NAMING_RULES as rule (rule.value)}
					<label
						class={[
							'p-3 border rounded-lg cursor-pointer transition-all',
							namingRule === rule.value
								? 'border-wwise bg-wwise/5 ring-1 ring-wwise/20'
								: 'border-base bg-surface-50 hover:border-surface-300 dark:bg-surface-800 dark:hover:border-surface-600'
						]}
					>
						<input type="radio" bind:group={namingRule} value={rule.value} class="sr-only" />
						<p class="text-sm text-base font-medium m-0">{rule.label}</p>
						<p class="text-xs text-muted m-0 mt-1">{rule.description}</p>
					</label>
				{/each}
			</div>
		</fieldset>

		<!-- Custom Regex -->
		{#if namingRule === 'custom_regex'}
			<div class="p-4 border border-base rounded-lg bg-surface-50 space-y-4 dark:bg-surface-800">
				<div class="space-y-1.5">
					<label
						for="{uid}-regex-pattern"
						class="text-[10px] text-muted tracking-wider font-medium block uppercase"
					>
						Regex Pattern
					</label>
					<input
						id="{uid}-regex-pattern"
						type="text"
						bind:value={customRegex}
						placeholder="(.+)_\d+$"
						class="text-sm text-base font-mono px-3 py-2 border border-base rounded-lg bg-base w-full transition-colors focus:outline-none focus:border-wwise focus:ring-1 focus:ring-wwise/20"
					/>
				</div>
				<div class="space-y-1.5">
					<label
						for="{uid}-replacement"
						class="text-[10px] text-muted tracking-wider font-medium block uppercase"
					>
						Replacement
					</label>
					<input
						id="{uid}-replacement"
						type="text"
						bind:value={customReplacement}
						placeholder="$1"
						class="text-sm text-base font-mono px-3 py-2 border border-base rounded-lg bg-base w-full transition-colors focus:outline-none focus:border-wwise focus:ring-1 focus:ring-wwise/20"
					/>
				</div>
			</div>
		{/if}

		<!-- Container Type -->
		<div class="space-y-2">
			<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
				Container Type
			</span>
			<div class="max-w-xs">
				<Select
					items={containerItems}
					bind:value={containerType}
					placeholder="Select container..."
					id="container-type"
				/>
			</div>
		</div>
	</div>

	<!-- Status -->
	{#if statusMessage}
		<div
			class={[
				'text-sm px-4 py-3 rounded-lg flex gap-2 items-center',
				statusType === 'success' &&
					'text-green-600 border border-green-500/20 bg-green-500/10 dark:text-green-400',
				statusType === 'error' &&
					'text-red-600 border border-red-500/20 bg-red-500/10 dark:text-red-400',
				statusType === 'info' && 'text-wwise border border-wwise/20 bg-wwise/10'
			]}
		>
			{statusMessage}
		</div>
	{/if}

	<!-- Skipped Objects Warning -->
	{#if skippedObjects.length > 0}
		{@const skippedTypes = [...new Set(skippedObjects.map((o) => o.type))]}
		{@const hasFolderOnlyTypes = skippedObjects.some((o) => FOLDER_ONLY_TYPES.has(o.type))}
		<Alert variant="warning">
			<p class="font-medium m-0">{skippedObjects.length} object(s) will be skipped</p>
			<p class="text-xs m-0 mt-1 opacity-80">
				{#if hasFolderOnlyTypes && !UNIVERSAL_CONTAINERS.has(containerType)}
					These types require Folder or Work Unit: {skippedTypes.join(', ')}
				{:else}
					The following types cannot be wrapped: {skippedTypes.join(', ')}
				{/if}
			</p>
		</Alert>
	{/if}

	<!-- Preview -->
	{#if wrappableObjects.length > 0}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted"
					>{wrappableObjects.length} object{wrappableObjects.length !== 1 ? 's' : ''}</span
				>
			</div>
			<div class="space-y-2">
				{#each groupedByParent as [key, objects] (key)}
					{@const parentPath = getParentPath(key)}
					<div class="p-4 border border-base rounded-lg bg-base">
						<div class="flex gap-2 items-center">
							<Badge variant="wwise">
								{CONTAINER_TYPES.find((t) => t.value === containerType)?.label}
							</Badge>
							<span class="text-sm text-base font-medium flex-1 truncate">
								{previewNames.get(key) || 'NewContainer'}
							</span>
							<span class="text-xs text-wwise px-2 py-0.5 rounded-full bg-wwise/10 shrink-0">
								{objects.length} child{objects.length !== 1 ? 'ren' : ''}
							</span>
						</div>
						<div class="text-xs text-muted mb-3 mt-2 truncate" title={parentPath}>
							{parentPath}
						</div>
						<div class="pl-3 border-l-2 border-surface-200 space-y-1 dark:border-surface-700">
							{#each objects as obj (obj.id)}
								<div class="text-xs text-muted">
									<span class="text-subtle">{getTypeDisplayName(obj.type)}:</span>
									<span class="text-base ml-1">{obj.name}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
