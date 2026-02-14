<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import {
		RefreshCw,
		GitBranch,
		Settings2,
		ChevronDown,
		ChevronRight,
		CircleAlert,
		SkipForward,
		Check,
		Star,
		Plus,
		X
	} from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge from '$lib/components/badge.svelte';
	import GroupedCombobox, {
		type GroupedComboboxGroup
	} from '$lib/components/grouped-combobox.svelte';
	import Combobox from '$lib/components/combobox.svelte';

	// Types
	interface SwitchContainerInfo {
		container: WwiseObject;
		switchGroup: WwiseObject | null;
		defaultSwitch: WwiseObject | null;
		children: WwiseObject[];
		switches: WwiseObject[];
		existingAssignments: Map<string, string[]>; // childId -> switchIds[]
		switchToChildren: Map<string, string[]>; // switchId -> childNames[]
	}

	interface AssignmentPreview {
		childId: string;
		childName: string;
		matchedSwitches: WwiseObject[]; // All switches that match this child
		selectedSwitchId: string; // Currently selected switch to assign
		selectedSwitchName: string;
		alreadyAssignedSwitchIds: Set<string>; // Matched switches this child is already assigned to
		existingOtherSwitchIds: string[]; // Existing assignments to non-matching switches
		existingOtherSwitchNames: string[];
		isSkipped: boolean;
		// For each matched switch, which children are already assigned to it
		switchExistingChildren: Map<string, string[]>;
	}

	type ConflictResolution = 'keep' | 'replace';
	type AssignmentRule = 'name_contains' | 'name_equals' | 'custom_regex' | 'custom_list';

	const RULES: { value: AssignmentRule; label: string; desc: string }[] = [
		{ value: 'name_contains', label: 'Name Contains', desc: 'Child contains switch name' },
		{ value: 'name_equals', label: 'Exact Match', desc: 'Child equals switch name' },
		{ value: 'custom_regex', label: 'Regex', desc: 'Extract with capture group' },
		{ value: 'custom_list', label: 'Custom List', desc: 'Manual pattern mappings' }
	];

	// State
	let selectedObjects = $state<WwiseObject[]>([]);
	let switchContainers = $state<SwitchContainerInfo[]>([]);
	let isLoading = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');

	// Settings
	let rule = $state<AssignmentRule>('name_contains');
	let customRegex = $state('(.+)');
	let customListText = $state('');
	let caseSensitive = $state(false);
	let ignoreExisting = $state(false);
	let expandedIds = new SvelteSet<string>();

	// Per-item conflict resolution (child has existing assignments to non-matching switches)
	let itemResolutions = new SvelteMap<string, ConflictResolution>();
	// Per-item switch conflict resolution (switch already has children)
	let switchResolutions = new SvelteMap<string, ConflictResolution>();
	// Per-item skipped state
	let skippedItems = new SvelteSet<string>();
	// Per-item selected switch (when multiple matches)
	let selectedSwitches = new SvelteMap<string, string>();

	// Group configuration for unconfigured containers
	let allSwitchGroups = $state<WwiseObject[]>([]);
	let allStateGroups = $state<WwiseObject[]>([]);
	let pendingGroups = new SvelteMap<string, string>();
	let pendingDefaults = new SvelteMap<string, string>();

	// Inline editing for default switch on configured containers
	let editingDefault = $state<string | null>(null);
	let editingDefaultValue = $state<string | undefined>(undefined);
	let inlineLoading = $state<string | null>(null);

	const uid = $props.id();

	// Helpers
	const isNullGuid = (id?: string) => !id || id === '{00000000-0000-0000-0000-000000000000}';
	const normalizeId = (id: string) => id.replace(/[{}]/g, '').toLowerCase();

	// Parse custom list
	const customMappings = $derived.by(() => {
		const mappings: { child: string; sw: string }[] = [];
		for (const line of customListText.split('\n')) {
			const t = line.trim();
			if (!t) continue;
			const parts = t.includes('\t') ? t.split('\t') : t.split(',');
			if (parts.length >= 2) {
				mappings.push({ child: parts[0].trim(), sw: parts[1].trim() });
			}
		}
		return mappings;
	});

	// Derived state
	const validContainers = $derived(selectedObjects.filter((o) => o.type === 'SwitchContainer'));
	const skippedObjects = $derived(selectedObjects.filter((o) => o.type !== 'SwitchContainer'));
	const unconfigured = $derived(switchContainers.filter((sc) => isNullGuid(sc.switchGroup?.id)));
	const configured = $derived(switchContainers.filter((sc) => !isNullGuid(sc.switchGroup?.id)));

	const groupOptions = $derived<GroupedComboboxGroup[]>([
		{ label: 'Switch Groups', items: allSwitchGroups.map((g) => ({ label: g.name, value: g.id })) },
		{ label: 'State Groups', items: allStateGroups.map((g) => ({ label: g.name, value: g.id })) }
	]);

	// Generate previews
	const previews = $derived.by(() => {
		const map = new SvelteMap<string, AssignmentPreview[]>();
		for (const sc of configured) {
			const items: AssignmentPreview[] = [];
			for (const child of sc.children) {
				const matches = findAllMatches(child.name, sc.switches);
				if (matches.length > 0) {
					const nid = normalizeId(child.id);
					const existing = ignoreExisting ? [] : (sc.existingAssignments.get(nid) ?? []);
					const existingNormalized = new Set(existing.map(normalizeId));
					// At least one match must be unassigned (when ignoreExisting, all are considered unassigned)
					const firstNew = matches.find((m) => !existingNormalized.has(normalizeId(m.id)));
					if (firstNew) {
						// Default selection: first unassigned match (most specific)
						const selectedId = selectedSwitches.get(child.id) ?? firstNew.id;
						const selectedSwitch = matches.find((m) => m.id === selectedId) ?? firstNew;
						// Build map of which children are already assigned to each matched switch
						// eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt per derivation, not reactive state
						const switchExistingChildren = new Map<string, string[]>();
						if (!ignoreExisting) {
							for (const sw of matches) {
								const existingChildren = sc.switchToChildren.get(normalizeId(sw.id)) ?? [];
								if (existingChildren.length > 0) {
									switchExistingChildren.set(sw.id, existingChildren);
								}
							}
						}
						// Track which matched switches are already assigned to this child
						const alreadyAssignedSwitchIds = new Set(
							matches.filter((m) => existingNormalized.has(normalizeId(m.id))).map((m) => m.id)
						);
						// Find existing assignments to non-matching switches
						const matchedNormalized = new Set(matches.map((m) => normalizeId(m.id)));
						const existingOtherSwitchIds = existing.filter(
							(id) => !matchedNormalized.has(normalizeId(id))
						);
						const existingOtherSwitchNames = existingOtherSwitchIds.map(
							(id) =>
								sc.switches.find((s) => normalizeId(s.id) === normalizeId(id))?.name ?? 'Unknown'
						);
						items.push({
							childId: child.id,
							childName: child.name,
							matchedSwitches: matches,
							selectedSwitchId: selectedSwitch.id,
							selectedSwitchName: selectedSwitch.name,
							alreadyAssignedSwitchIds,
							existingOtherSwitchIds,
							existingOtherSwitchNames,
							isSkipped: skippedItems.has(child.id),
							switchExistingChildren
						});
					}
				}
			}
			if (items.length > 0) map.set(sc.container.id, items);
		}
		return map;
	});

	// Children whose matches are ALL already assigned (not in preview, but not truly unmatched)
	const fullyAssignedByContainer = $derived.by(() => {
		const map = new SvelteMap<string, { child: WwiseObject; switchNames: string[] }[]>();
		if (ignoreExisting) return map;
		for (const sc of configured) {
			const previewChildIds = new Set((previews.get(sc.container.id) ?? []).map((p) => p.childId));
			const items: { child: WwiseObject; switchNames: string[] }[] = [];
			for (const child of sc.children) {
				if (previewChildIds.has(child.id)) continue;
				const matches = findAllMatches(child.name, sc.switches);
				if (matches.length > 0) {
					const nid = normalizeId(child.id);
					const existingIds = sc.existingAssignments.get(nid) ?? [];
					const switchNames = existingIds.map(
						(id) => sc.switches.find((s) => normalizeId(s.id) === normalizeId(id))?.name ?? id
					);
					items.push({ child, switchNames });
				}
			}
			if (items.length > 0) map.set(sc.container.id, items);
		}
		return map;
	});

	const totalAssignments = $derived.by(() => {
		let count = 0;
		for (const items of previews.values()) {
			for (const p of items) {
				if (!p.isSkipped && !p.alreadyAssignedSwitchIds.has(p.selectedSwitchId)) count++;
			}
		}
		return count;
	});
	const totalSkipped = $derived.by(() => {
		let count = 0;
		for (const items of previews.values()) {
			for (const p of items) {
				if (p.isSkipped) count++;
			}
		}
		return count;
	});

	// Count switch conflicts (switches that already have children assigned)
	const totalSwitchConflicts = $derived.by(() => {
		let c = 0;
		for (const items of previews.values()) {
			for (const p of items) {
				const existing = p.switchExistingChildren.get(p.selectedSwitchId) ?? [];
				if (existing.length > 0) c++;
			}
		}
		return c;
	});

	// Check if all switch conflicts have the same resolution
	const bulkSwitchResolution = $derived.by(() => {
		if (totalSwitchConflicts === 0) return null;
		let allKeep = true;
		let allReplace = true;
		for (const items of previews.values()) {
			for (const p of items) {
				const existing = p.switchExistingChildren.get(p.selectedSwitchId) ?? [];
				if (existing.length > 0) {
					const res = switchResolutions.get(p.childId);
					if (res === 'replace') allKeep = false;
					else allReplace = false;
				}
			}
		}
		if (allKeep) return 'keep' as const;
		if (allReplace) return 'replace' as const;
		return null;
	});

	function findAllMatches(childName: string, switches: WwiseObject[]): WwiseObject[] {
		const name = caseSensitive ? childName : childName.toLowerCase();
		const matches: WwiseObject[] = [];
		for (const sw of switches) {
			const swName = caseSensitive ? sw.name : sw.name.toLowerCase();
			switch (rule) {
				case 'name_contains':
					if (name.includes(swName)) matches.push(sw);
					break;
				case 'name_equals':
					if (name === swName) matches.push(sw);
					break;
				case 'custom_regex':
					try {
						const match = childName.match(new RegExp(customRegex, caseSensitive ? '' : 'i'));
						if (match) {
							const ext = caseSensitive
								? (match[1] ?? match[0])
								: (match[1] ?? match[0]).toLowerCase();
							if (ext === swName || swName.includes(ext)) matches.push(sw);
						}
					} catch {
						// Invalid regex pattern, skip matching
					}
					break;
				case 'custom_list':
					for (const m of customMappings) {
						const cp = caseSensitive ? m.child : m.child.toLowerCase();
						const sp = caseSensitive ? m.sw : m.sw.toLowerCase();
						if (name.includes(cp) && swName.includes(sp)) {
							matches.push(sw);
							break; // Only add each switch once per custom mapping
						}
					}
					break;
			}
		}
		// Sort matches by name length descending (longer/more specific names first)
		return matches.sort((a, b) => b.name.length - a.name.length);
	}

	async function loadSelection() {
		if (!wwise.isConnected) return;
		isLoading = true;
		statusMessage = '';
		try {
			selectedObjects = await wwise.getSelectedObjects();
			if (validContainers.length === 0) {
				statusMessage = 'No switch containers selected';
				statusType = 'info';
				switchContainers = [];
				return;
			}
			[allSwitchGroups, allStateGroups] = await Promise.all([
				wwise.getAllSwitchGroups(),
				wwise.getAllStateGroups()
			]);
			switchContainers = await Promise.all(validContainers.map(loadContainerInfo));
			pendingGroups.clear();
			pendingDefaults.clear();
			itemResolutions.clear();
			switchResolutions.clear();
			skippedItems.clear();
			selectedSwitches.clear();
			// Expand all configured containers by default
			expandedIds.clear();
			for (const sc of switchContainers) {
				if (!isNullGuid(sc.switchGroup?.id)) expandedIds.add(sc.container.id);
			}
			statusMessage = `Found ${validContainers.length} switch container(s)`;
			statusType = 'info';
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to get selection';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	async function loadContainerInfo(container: WwiseObject): Promise<SwitchContainerInfo> {
		let switchGroup: WwiseObject | null = null;
		let defaultSwitch: WwiseObject | null = null;
		try {
			switchGroup = await wwise.getSwitchGroupOrStateGroup(container.id);
		} catch {
			// Container may not have a switch group configured
		}
		try {
			defaultSwitch = await wwise.getDefaultSwitchOrState(container.id);
			if (defaultSwitch && isNullGuid(defaultSwitch.id)) defaultSwitch = null;
		} catch {
			// Container may not have a default switch configured
		}

		const children = await wwise.getChildren(container.id);
		let switches: WwiseObject[] = [];
		if (switchGroup?.id && !isNullGuid(switchGroup.id)) {
			try {
				switches = await wwise.getChildren(switchGroup.id);
			} catch {
				// Failed to get switches from group
			}
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable, not reactive state
		const existingAssignments: Map<string, string[]> = new Map();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable, not reactive state
		const switchToChildren: Map<string, string[]> = new Map();
		try {
			const raw = await wwise.getSwitchContainerAssignments(container.id);
			for (const a of raw) {
				const childNid = a.child.replace(/[{}]/g, '').toLowerCase();
				const switchNid = a.stateOrSwitch.replace(/[{}]/g, '').toLowerCase();
				// Child -> switches mapping
				const childArr = existingAssignments.get(childNid) ?? [];
				childArr.push(a.stateOrSwitch);
				existingAssignments.set(childNid, childArr);
				// Switch -> children mapping (store child name for display)
				const childObj = children.find((c) => normalizeId(c.id) === childNid);
				if (childObj) {
					const switchArr = switchToChildren.get(switchNid) ?? [];
					switchArr.push(childObj.name);
					switchToChildren.set(switchNid, switchArr);
				}
			}
		} catch {
			// Failed to get existing assignments
		}

		return {
			container,
			switchGroup,
			defaultSwitch,
			children,
			switches,
			existingAssignments,
			switchToChildren
		};
	}

	async function handleGroupSelect(containerId: string, groupId: string) {
		pendingGroups.set(containerId, groupId);
		// Clear previous default selection since it's no longer valid
		pendingDefaults.delete(containerId);
		try {
			const switches = await wwise.getChildren(groupId);
			switchContainers = switchContainers.map((sc) =>
				sc.container.id === containerId ? { ...sc, switches } : sc
			);
		} catch {
			// Failed to get switches from group
		}
	}

	async function setDefaultSwitch(containerId: string, switchId: string) {
		inlineLoading = `default-${containerId}`;
		try {
			await wwise.setDefaultSwitchOrState(containerId, switchId);
			// Reload container info
			const container = switchContainers.find((sc) => sc.container.id === containerId)?.container;
			if (container) {
				const newInfo = await loadContainerInfo(container);
				switchContainers = switchContainers.map((sc) =>
					sc.container.id === containerId ? newInfo : sc
				);
			}
			editingDefault = null;
			editingDefaultValue = undefined;
			statusMessage = 'Default switch set';
			statusType = 'success';
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to set default';
			statusType = 'error';
		} finally {
			inlineLoading = null;
		}
	}

	async function configureContainer(containerId: string) {
		const groupId = pendingGroups.get(containerId);
		if (!groupId) return;
		isLoading = true;
		try {
			await wwise.setSwitchGroupOrStateGroup(containerId, groupId);
			const defaultId = pendingDefaults.get(containerId);
			if (defaultId) await wwise.setDefaultSwitchOrState(containerId, defaultId);

			const container = switchContainers.find((sc) => sc.container.id === containerId)?.container;
			if (container) {
				const newInfo = await loadContainerInfo(container);
				switchContainers = switchContainers.map((sc) =>
					sc.container.id === containerId ? newInfo : sc
				);
			}
			pendingGroups.delete(containerId);
			pendingDefaults.delete(containerId);
			statusMessage = 'Container configured';
			statusType = 'success';
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to configure';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	function toggleSkip(childId: string) {
		if (skippedItems.has(childId)) skippedItems.delete(childId);
		else skippedItems.add(childId);
	}

	function skipAll() {
		for (const items of previews.values()) {
			for (const p of items) skippedItems.add(p.childId);
		}
	}

	function unskipAll() {
		skippedItems.clear();
	}

	function selectSwitch(childId: string, switchId: string) {
		selectedSwitches.set(childId, switchId);
	}

	function setItemResolution(childId: string, res: ConflictResolution) {
		itemResolutions.set(childId, res);
	}

	function setSwitchResolution(childId: string, res: ConflictResolution) {
		switchResolutions.set(childId, res);
	}

	function setAllSwitchResolutions(res: ConflictResolution) {
		for (const items of previews.values()) {
			for (const p of items) {
				const existing = p.switchExistingChildren.get(p.selectedSwitchId) ?? [];
				if (existing.length > 0) switchResolutions.set(p.childId, res);
			}
		}
	}

	function toggleExpand(id: string) {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	async function execute() {
		if (totalAssignments === 0) return;
		isExecuting = true;
		statusMessage = 'Assigning...';
		statusType = 'info';
		try {
			await wwise.beginUndoGroup();
			let assigned = 0,
				removed = 0;

			// When ignoring existing, remove all current assignments first
			if (ignoreExisting) {
				for (const sc of switchContainers) {
					for (const [childNid, switchIds] of sc.existingAssignments) {
						const childObj = sc.children.find((c) => normalizeId(c.id) === childNid);
						if (!childObj) continue;
						for (const switchId of switchIds) {
							try {
								await wwise.removeSwitchContainerAssignment(sc.container.id, childObj.id, switchId);
								removed++;
							} catch {
								// Failed to remove assignment, continue
							}
						}
					}
				}
			}

			for (const [containerId, items] of previews) {
				for (const p of items) {
					// Skip if marked as skipped or selected switch is already assigned
					if (p.isSkipped) continue;
					if (p.alreadyAssignedSwitchIds.has(p.selectedSwitchId)) continue;

					// Handle existing assignments to non-matching switches
					if (p.existingOtherSwitchIds.length > 0 && itemResolutions.get(p.childId) === 'replace') {
						for (const existingId of p.existingOtherSwitchIds) {
							try {
								await wwise.removeSwitchContainerAssignment(containerId, p.childId, existingId);
								removed++;
							} catch {
								// Failed to remove assignment, continue
							}
						}
					}

					// Handle switch -> children conflict (remove other children from target switch)
					const existingChildrenOnSwitch = p.switchExistingChildren.get(p.selectedSwitchId) ?? [];
					const shouldRemoveFromSwitch =
						existingChildrenOnSwitch.length > 0 && switchResolutions.get(p.childId) === 'replace';
					if (shouldRemoveFromSwitch) {
						const sc = switchContainers.find((s) => s.container.id === containerId);
						if (sc) {
							for (const childName of existingChildrenOnSwitch) {
								const childObj = sc.children.find((c) => c.name === childName);
								if (childObj) {
									try {
										await wwise.removeSwitchContainerAssignment(
											containerId,
											childObj.id,
											p.selectedSwitchId
										);
										removed++;
									} catch {
										// Failed to remove assignment, continue
									}
								}
							}
						}
					}

					try {
						await wwise.assignSwitchContainerChild(containerId, p.childId, p.selectedSwitchId);
						assigned++;
					} catch (e) {
						if (!(e instanceof Error && e.message.includes('already exists'))) throw e;
					}
				}
			}

			await wwise.endUndoGroup('Assign Switch Container Children');
			statusMessage = `Assigned ${assigned} child(ren)${removed > 0 ? `, removed ${removed} existing` : ''}`;
			statusType = 'success';
			selectedObjects = [];
			switchContainers = [];
			itemResolutions.clear();
			switchResolutions.clear();
			skippedItems.clear();
			selectedSwitches.clear();
		} catch (e) {
			try {
				await wwise.cancelUndoGroup();
			} catch {
				// Failed to cancel undo group
			}
			statusMessage = e instanceof Error ? e.message : 'Assignment failed';
			statusType = 'error';
		} finally {
			isExecuting = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Assign switch container children to switches based on naming patterns.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button
				onclick={loadSelection}
				disabled={!wwise.isConnected || isLoading}
				class="text-sm text-base font-medium px-4 rounded-lg bg-surface-200 flex flex-1 gap-2 h-10 transition-colors items-center justify-center dark:bg-surface-800 hover:bg-surface-300 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed dark:hover:bg-surface-700"
			>
				<RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
				{isLoading ? 'Loading...' : 'Get Selection'}
			</button>
			<button
				onclick={execute}
				disabled={!wwise.isConnected ||
					totalAssignments === 0 ||
					isExecuting ||
					unconfigured.length > 0}
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			>
				<GitBranch size={16} />
				{isExecuting
					? 'Assigning...'
					: `Assign${totalAssignments > 0 ? ` (${totalAssignments})` : ''}`}
			</button>
		</div>
	</div>

	<!-- Settings -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-5">
		<!-- Rules -->
		<fieldset class="space-y-3">
			<legend class="text-[10px] text-muted tracking-wider font-medium uppercase"
				>Assignment Rule</legend
			>
			<div class="gap-2 grid sm:grid-cols-4">
				{#each RULES as r (r.value)}
					<label
						class={[
							'p-3 border rounded-lg cursor-pointer transition-all',
							rule === r.value
								? 'ring-accent-selected'
								: 'border-base bg-surface-50 hover:border-surface-300 dark:bg-surface-800 dark:hover:border-surface-600'
						]}
					>
						<input type="radio" bind:group={rule} value={r.value} class="sr-only" />
						<p class="text-sm text-base font-medium m-0">{r.label}</p>
						<p class="text-xs text-muted m-0 mt-1">{r.desc}</p>
					</label>
				{/each}
			</div>
		</fieldset>

		<!-- Rule-specific options -->
		{#if rule === 'custom_regex'}
			<div class="space-y-2">
				<label
					for="{uid}-regex"
					class="text-[10px] text-muted tracking-wider font-medium block uppercase"
					>Regex Pattern</label
				>
				<input
					id="{uid}-regex"
					type="text"
					bind:value={customRegex}
					placeholder="(.+)_\d+$"
					class="input-base font-mono px-3 py-2"
				/>
				<p class="text-xs text-muted">
					Use capture groups. Example: <code
						class="text-xs px-1 py-0.5 rounded bg-surface-200 dark:bg-surface-700">(.+)_var\d+</code
					> extracts "Grass" from "Grass_var01"
				</p>
			</div>
		{:else if rule === 'custom_list'}
			<div class="space-y-2">
				<label
					for="{uid}-list"
					class="text-[10px] text-muted tracking-wider font-medium block uppercase"
					>Mappings (ChildPattern, SwitchPattern)</label
				>
				<textarea
					id="{uid}-list"
					bind:value={customListText}
					placeholder="Banana, Fruit"
					rows="4"
					class="input-base font-mono px-3 py-2 resize-y"
				></textarea>
				{#if customMappings.length > 0}
					<p class="text-xs text-muted">
						{customMappings.length} mapping{customMappings.length !== 1 ? 's' : ''}:
						{#each customMappings.slice(0, 3) as m, i (i)}
							<span class="text-xs ml-1 px-1 py-0.5 rounded bg-surface-200 dark:bg-surface-700"
								>{m.child}→{m.sw}</span
							>
						{/each}
						{#if customMappings.length > 3}<span class="ml-1">+{customMappings.length - 3}</span
							>{/if}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Options row -->
		<div class="text-sm flex flex-wrap gap-x-6 gap-y-2">
			<label class="flex gap-2 cursor-pointer items-center">
				<input
					type="checkbox"
					bind:checked={caseSensitive}
					class="accent-wwise border-base rounded"
				/>
				<span class="text-muted">Case sensitive</span>
			</label>
			<label class="flex gap-2 cursor-pointer items-center">
				<input
					type="checkbox"
					bind:checked={ignoreExisting}
					class="accent-wwise border-base rounded"
				/>
				<span class="text-muted">Ignore existing</span>
			</label>
		</div>

		<!-- Bulk switch conflict resolution -->
		{#if totalSwitchConflicts > 0}
			<div
				class="text-sm p-3 border border-amber-500/30 rounded-lg bg-amber-500/5 flex flex-wrap gap-3 items-center"
			>
				<div class="text-amber-600 flex gap-2 items-center dark:text-amber-400">
					<CircleAlert size={16} />
					<span class="font-medium"
						>{totalSwitchConflicts} conflict{totalSwitchConflicts !== 1 ? 's' : ''}</span
					>
				</div>
				<span class="text-xs text-amber-600/70 dark:text-amber-400/70"
					>Switches already have other children</span
				>
				<div class="ml-auto flex gap-1.5">
					<button
						onclick={() => setAllSwitchResolutions('keep')}
						class={[
							'text-xs font-medium px-3 py-1.5 rounded-md transition-colors border',
							bulkSwitchResolution === 'keep'
								? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
								: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
						]}
					>
						Keep All
					</button>
					<button
						onclick={() => setAllSwitchResolutions('replace')}
						class={[
							'text-xs font-medium px-3 py-1.5 rounded-md transition-colors border',
							bulkSwitchResolution === 'replace'
								? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
								: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
						]}
					>
						Replace All
					</button>
				</div>
			</div>
		{/if}
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

	<!-- Skipped warning -->
	{#if skippedObjects.length > 0}
		<Alert variant="warning">
			{skippedObjects.length} non-switch-container object(s) skipped
		</Alert>
	{/if}

	<!-- Unconfigured containers -->
	{#if unconfigured.length > 0}
		<section>
			<h3
				class="text-[10px] text-amber-600 tracking-wider font-medium mb-4 flex gap-1.5 uppercase items-center dark:text-amber-400"
			>
				<Settings2 size={14} />
				Needs Configuration ({unconfigured.length})
			</h3>
			<div class="space-y-3">
				{#each unconfigured as sc (sc.container.id)}
					{@const selectedGroupId = pendingGroups.get(sc.container.id)}
					{@const selectedDefaultId = pendingDefaults.get(sc.container.id)}
					<div class="p-4 border border-amber-500/30 rounded-xl bg-amber-900/10 space-y-4">
						<div class="flex gap-2 items-center">
							<Badge variant="amber">Switch Container</Badge>
							<span class="text-sm font-medium truncate">{sc.container.name}</span>
						</div>
						<div class="gap-3 grid sm:grid-cols-2 sm:items-end">
							<div class="space-y-1.5">
								<span class="text-[10px] text-muted tracking-wider font-medium block uppercase"
									>Switch/State Group</span
								>
								<GroupedCombobox
									groups={groupOptions}
									value={selectedGroupId}
									placeholder="Select group..."
									id="{uid}-grp-{sc.container.id}"
									onchange={(v) => handleGroupSelect(sc.container.id, v)}
									compact
								/>
							</div>
							{#if selectedGroupId && sc.switches.length > 0}
								<div class="space-y-1.5">
									<span class="text-[10px] text-muted tracking-wider font-medium block uppercase"
										>Default Switch (optional)</span
									>
									<Combobox
										items={sc.switches.map((s) => ({ label: s.name, value: s.id }))}
										value={selectedDefaultId}
										placeholder="Select default..."
										id="{uid}-def-{sc.container.id}"
										onchange={(v) => {
											pendingDefaults.set(sc.container.id, v);
										}}
										compact
									/>
								</div>
							{/if}
						</div>
						<button
							onclick={() => configureContainer(sc.container.id)}
							disabled={!selectedGroupId || isLoading}
							class="text-sm text-white font-medium px-4 rounded-lg bg-wwise flex gap-2 h-9 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Configure
						</button>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Preview -->
	{#if configured.length > 0}
		<section class="space-y-3">
			<div class="flex gap-3 items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<div class="flex gap-3 items-center">
					<div class="text-xs flex gap-2 items-center">
						{#if totalSkipped > 0}
							<span class="text-surface-500">{totalSkipped} skipped</span>
							<span class="text-surface-300 dark:text-surface-600">·</span>
						{/if}
						<span class="text-muted">{totalAssignments} to assign</span>
					</div>
					<!-- Skip controls -->
					{#if totalAssignments > 0 || totalSkipped > 0}
						<div class="p-1 rounded-lg bg-surface-100 flex gap-1 dark:bg-surface-800">
							<button
								onclick={unskipAll}
								disabled={totalSkipped === 0}
								class={[
									'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
									totalSkipped === 0
										? 'bg-green-500 text-white shadow-sm'
										: 'text-muted hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50'
								]}
							>
								Include All
							</button>
							<button
								onclick={skipAll}
								disabled={totalAssignments === 0}
								class={[
									'text-xs font-medium px-2.5 py-1 rounded-md transition-colors',
									totalAssignments === 0 && totalSkipped > 0
										? 'bg-surface-400 text-white shadow-sm'
										: 'text-muted hover:text-surface-900 dark:hover:text-surface-100 hover:bg-surface-200 dark:hover:bg-surface-700 disabled:opacity-50'
								]}
							>
								Skip All
							</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="space-y-2">
				{#each configured as sc (sc.container.id)}
					{@const items = previews.get(sc.container.id) ?? []}
					{@const expanded = expandedIds.has(sc.container.id)}
					<div class="p-4 border border-base rounded-lg bg-base">
						<!-- Container header -->
						<button
							onclick={() => toggleExpand(sc.container.id)}
							class="text-left flex gap-2 w-full items-center"
						>
							{#if expanded}<ChevronDown
									size={14}
									class="text-muted shrink-0"
								/>{:else}<ChevronRight size={14} class="text-muted shrink-0" />{/if}
							<div class="flex flex-1 gap-2 min-w-0 items-center">
								<Badge variant="wwise">Switch Container</Badge>
								<span class="text-sm text-base font-medium truncate">{sc.container.name}</span>
							</div>
							<span class="text-xs text-muted shrink-0">{sc.switchGroup?.name ?? '—'}</span>
							<span
								class={[
									'text-xs px-2 py-0.5 rounded-full shrink-0',
									items.length > 0
										? 'bg-wwise/10 text-wwise'
										: 'bg-surface-100 text-muted dark:bg-surface-700'
								]}
							>
								{items.length} match{items.length !== 1 ? 'es' : ''}
							</span>
						</button>

						<!-- Expanded content -->
						{#if expanded}
							{@const fullyAssigned = fullyAssignedByContainer.get(sc.container.id) ?? []}
							{@const unmatched = sc.children.filter(
								(c) =>
									!items.some((p) => p.childId === c.id) &&
									!fullyAssigned.some((fa) => fa.child.id === c.id)
							)}
							{@const isEditingDefault = editingDefault === sc.container.id}
							{@const defaultItems = sc.switches.map((sw) => ({ label: sw.name, value: sw.id }))}
							<div class="mt-3 pt-3 border-t border-base">
								<!-- No default switch warning -->
								{#if !sc.defaultSwitch}
									<div class="mb-3">
										<div
											class="text-sm p-3 border border-orange-500/20 rounded-lg bg-orange-500/8 dark:bg-orange-500/10"
										>
											<div class="flex gap-2 items-center">
												<Star size={12} class="text-orange-500 shrink-0" />
												<span class="text-orange-700 flex-1 dark:text-orange-300"
													>No default switch/state assigned</span
												>
												{#if !isEditingDefault}
													<button
														onclick={() => {
															editingDefault = sc.container.id;
														}}
														class="text-orange-500 p-1 rounded-full transition-colors hover:text-orange-700 hover:bg-orange-500/10 dark:hover:text-orange-300"
														title="Set default"
													>
														<Plus size={14} />
													</button>
												{/if}
											</div>
											{#if isEditingDefault}
												<div
													class="mt-2 pt-2 border-t border-orange-500/20 flex gap-2 items-center"
												>
													<div class="flex-1">
														<Combobox
															items={defaultItems}
															bind:value={editingDefaultValue}
															placeholder="Search switches…"
															id="{uid}-default-{sc.container.id}"
															allowCustomValue={false}
															disabled={inlineLoading === `default-${sc.container.id}`}
															compact
															onchange={(val) => {
																if (val) setDefaultSwitch(sc.container.id, val);
															}}
														/>
													</div>
													<button
														onclick={() => {
															editingDefault = null;
															editingDefaultValue = undefined;
														}}
														class="text-muted p-1.5 rounded-md transition-colors hover:bg-surface-200 dark:hover:bg-surface-700"
														title="Cancel"
													>
														<X size={14} />
													</button>
												</div>
											{/if}
										</div>
									</div>
								{/if}

								{#if items.length > 0}
									<div class="pl-3 border-l-2 border-surface-200 space-y-2 dark:border-surface-700">
										{#each items as p (p.childId)}
											{@const switchRes = switchResolutions.get(p.childId)}
											{@const hasMultipleMatches = p.matchedSwitches.length > 1}
											{@const selectedSwitchExisting =
												p.switchExistingChildren.get(p.selectedSwitchId) ?? []}
											{@const hasSwitchConflict = selectedSwitchExisting.length > 0}
											<div class={['text-sm py-1.5', p.isSkipped && 'opacity-50']}>
												<div class="flex flex-wrap gap-2 items-center">
													<!-- Skip toggle button -->
													<button
														onclick={() => toggleSkip(p.childId)}
														aria-label={p.isSkipped
															? 'Include this assignment'
															: 'Skip this assignment'}
														class={[
															'p-1 rounded transition-colors shrink-0 group/skip',
															p.isSkipped
																? 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
																: 'text-green-500 hover:text-green-600 dark:hover:text-green-400'
														]}
														title={p.isSkipped
															? 'Click to include this assignment'
															: 'Click to skip — will not be assigned'}
													>
														{#if p.isSkipped}
															<SkipForward size={16} />
														{:else}
															<Check size={16} class="group-hover/skip:hidden" />
															<SkipForward size={16} class="hidden group-hover/skip:block" />
														{/if}
													</button>
													<span
														class={[
															'truncate',
															p.isSkipped ? 'text-surface-400 line-through' : 'text-muted'
														]}>{p.childName}</span
													>
													<span class={p.isSkipped ? 'text-surface-400' : 'text-wwise'}>→</span>
													{#if hasMultipleMatches && !p.isSkipped}
														<!-- Switch selector dropdown for multiple matches -->
														<select
															value={p.selectedSwitchId}
															onchange={(e) => selectSwitch(p.childId, e.currentTarget.value)}
															class="text-sm text-wwise font-medium py-1 pl-2.5 pr-7 appearance-none border border-wwise/30 rounded-lg bg-wwise/5 cursor-pointer transition-all focus-visible:outline-none focus-visible:border-wwise dark:bg-wwise/10 focus-visible:ring-2 dark:focus-visible:ring-wwise/30"
															style="background-image: url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2214%22 height=%2214%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%233069ff%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22m6 9 6 6 6-6%22/%3E%3C/svg%3E'); background-repeat: no-repeat; background-position: right 0.4rem center;"
														>
															{#each p.matchedSwitches as sw (sw.id)}
																{@const swExisting = p.switchExistingChildren.get(sw.id) ?? []}
																<option value={sw.id}
																	>{sw.name}{swExisting.length > 0
																		? ` (${swExisting.length} assigned)`
																		: ''}</option
																>
															{/each}
														</select>
														<span
															class="text-[10px] text-muted px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700"
														>
															{p.matchedSwitches.length} matches
														</span>
													{:else}
														<span
															class={[
																'font-medium',
																p.isSkipped ? 'text-surface-400 line-through' : 'text-wwise'
															]}>{p.selectedSwitchName}</span
														>
													{/if}
												</div>
												<!-- Show which children are already assigned to the selected switch -->
												{#if hasSwitchConflict && !p.isSkipped}
													<div class="text-xs mt-2 flex flex-wrap gap-2 items-center">
														<span class="text-amber-600 dark:text-amber-400">
															<span class="font-medium">{p.selectedSwitchName}</span> already has: {selectedSwitchExisting.join(
																', '
															)}
														</span>
														<div class="ml-auto flex shrink-0 gap-1.5">
															<button
																onclick={() => setSwitchResolution(p.childId, 'keep')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	switchRes !== 'replace'
																		? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Keep
															</button>
															<button
																onclick={() => setSwitchResolution(p.childId, 'replace')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	switchRes === 'replace'
																		? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Replace
															</button>
														</div>
													</div>
												{/if}
												<!-- Show existing assignments to non-matching switches -->
												{#if p.existingOtherSwitchNames.length > 0 && !p.isSkipped}
													{@const itemRes = itemResolutions.get(p.childId)}
													<div class="text-xs mt-2 flex flex-wrap gap-2 items-center">
														<span class="text-purple-600 dark:text-purple-400">
															Also assigned to: <span class="font-medium"
																>{p.existingOtherSwitchNames.join(', ')}</span
															>
														</span>
														<div class="ml-auto flex shrink-0 gap-1.5">
															<button
																onclick={() => setItemResolution(p.childId, 'keep')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	itemRes !== 'replace'
																		? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Keep Both
															</button>
															<button
																onclick={() => setItemResolution(p.childId, 'replace')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	itemRes === 'replace'
																		? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Remove Old
															</button>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{:else}
									<p class="text-sm text-muted m-0 py-2 text-center">No matches found</p>
								{/if}

								<!-- Already assigned children (all matches fulfilled) -->
								{#if fullyAssigned.length > 0}
									<details class="mt-3 pt-3 border-t border-base">
										<summary
											class="text-xs text-green-600 cursor-pointer transition-colors dark:text-green-400 hover:text-green-500"
										>
											{fullyAssigned.length} already assigned
										</summary>
										<div class="mt-2 pl-3 border-l-2 border-green-500/20 space-y-1">
											{#each fullyAssigned as fa (fa.child.id)}
												<div class="text-xs flex gap-2 items-center">
													<span class="text-muted truncate">{fa.child.name}</span>
													<span class="text-green-500">&rarr;</span>
													<span class="text-green-600 font-medium dark:text-green-400"
														>{fa.switchNames.join(', ')}</span
													>
													<Check size={12} class="text-green-500 shrink-0" />
												</div>
											{/each}
										</div>
									</details>
								{/if}

								<!-- Unmatched children -->
								{#if unmatched.length > 0}
									<details class="mt-3 pt-3 border-t border-base">
										<summary
											class="text-xs text-muted cursor-pointer transition-colors hover:text-surface-900 dark:hover:text-surface-100"
										>
											{unmatched.length} unmatched child{unmatched.length !== 1 ? 'ren' : ''}
										</summary>
										<div
											class="mt-2 pl-3 border-l-2 border-surface-200 space-y-1 dark:border-surface-700"
										>
											{#each unmatched as c (c.id)}
												<div class="text-xs text-muted truncate">{c.name}</div>
											{/each}
										</div>
									</details>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Not connected -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
