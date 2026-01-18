<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import {
		RefreshCw,
		GitBranch,
		Settings2,
		ChevronDown,
		ChevronRight,
		AlertCircle
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
		existingAssignments: Map<string, string[]>;
	}

	interface AssignmentPreview {
		childId: string;
		childName: string;
		switchId: string;
		switchName: string;
		isNew: boolean;
		hasConflict: boolean;
		existingSwitchIds: string[];
		existingSwitchNames: string[];
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
	let expandedIds = new SvelteSet<string>();

	// Per-item conflict resolution
	let itemResolutions = new SvelteMap<string, ConflictResolution>();

	// Group configuration for unconfigured containers
	let allSwitchGroups = $state<WwiseObject[]>([]);
	let allStateGroups = $state<WwiseObject[]>([]);
	let pendingGroups = new SvelteMap<string, string>();
	let pendingDefaults = new SvelteMap<string, string>();

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
				const match = findMatch(child.name, sc.switches);
				if (match) {
					const nid = normalizeId(child.id);
					const existing = sc.existingAssignments.get(nid) ?? [];
					const alreadyAssigned = existing.map(normalizeId).includes(normalizeId(match.id));
					if (!alreadyAssigned) {
						items.push({
							childId: child.id,
							childName: child.name,
							switchId: match.id,
							switchName: match.name,
							isNew: existing.length === 0,
							hasConflict: existing.length > 0,
							existingSwitchIds: existing,
							existingSwitchNames: existing.map(
								(id) => sc.switches.find((s) => normalizeId(s.id) === normalizeId(id))?.name ?? id
							)
						});
					}
				}
			}
			if (items.length > 0) map.set(sc.container.id, items);
		}
		return map;
	});

	const totalAssignments = $derived([...previews.values()].reduce((s, p) => s + p.length, 0));
	const totalConflicts = $derived.by(() => {
		let c = 0;
		for (const items of previews.values()) {
			for (const p of items) if (p.hasConflict) c++;
		}
		return c;
	});

	// Check if all conflicts have the same resolution
	const bulkResolution = $derived.by(() => {
		if (totalConflicts === 0) return null;
		let allKeep = true;
		let allReplace = true;
		for (const items of previews.values()) {
			for (const p of items) {
				if (p.hasConflict) {
					const res = itemResolutions.get(p.childId);
					if (res === 'replace') allKeep = false;
					else allReplace = false; // 'keep' or undefined (default to keep)
				}
			}
		}
		if (allKeep) return 'keep' as const;
		if (allReplace) return 'replace' as const;
		return null; // mixed
	});

	function findMatch(childName: string, switches: WwiseObject[]): WwiseObject | null {
		const name = caseSensitive ? childName : childName.toLowerCase();
		for (const sw of switches) {
			const swName = caseSensitive ? sw.name : sw.name.toLowerCase();
			switch (rule) {
				case 'name_contains':
					if (name.includes(swName)) return sw;
					break;
				case 'name_equals':
					if (name === swName) return sw;
					break;
				case 'custom_regex':
					try {
						const match = childName.match(new RegExp(customRegex, caseSensitive ? '' : 'i'));
						if (match) {
							const ext = (match[1] ?? match[0]).toLowerCase();
							if (ext === swName || swName.includes(ext)) return sw;
						}
					} catch {
						// Invalid regex pattern, skip matching
					}
					break;
				case 'custom_list':
					for (const m of customMappings) {
						const cp = caseSensitive ? m.child : m.child.toLowerCase();
						const sp = caseSensitive ? m.sw : m.sw.toLowerCase();
						if (name.includes(cp) && swName.includes(sp)) return sw;
					}
					break;
			}
		}
		return null;
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
		try {
			const raw = await wwise.getSwitchContainerAssignments(container.id);
			for (const a of raw) {
				const nid = a.child.replace(/[{}]/g, '').toLowerCase();
				const arr = existingAssignments.get(nid) ?? [];
				arr.push(a.stateOrSwitch);
				existingAssignments.set(nid, arr);
			}
		} catch {
			// Failed to get existing assignments
		}

		return { container, switchGroup, defaultSwitch, children, switches, existingAssignments };
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

	function setResolution(childId: string, res: ConflictResolution) {
		itemResolutions.set(childId, res);
	}

	function setAllResolutions(res: ConflictResolution) {
		for (const items of previews.values()) {
			for (const p of items) if (p.hasConflict) itemResolutions.set(p.childId, res);
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

			for (const [containerId, items] of previews) {
				for (const p of items) {
					const shouldRemove = p.hasConflict && itemResolutions.get(p.childId) === 'replace';
					if (shouldRemove) {
						for (const existingId of p.existingSwitchIds) {
							try {
								await wwise.removeSwitchContainerAssignment(containerId, p.childId, existingId);
								removed++;
							} catch {
								// Failed to remove assignment, continue
							}
						}
					}
					try {
						await wwise.assignSwitchContainerChild(containerId, p.childId, p.switchId);
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
		} catch (e) {
			try {
				await wwise.endUndoGroup('Assign Switch Container Children (Failed)');
			} catch {
				// Failed to end undo group
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
								? 'border-wwise bg-wwise/5 ring-1 ring-wwise/20'
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
					class="text-sm font-mono px-3 py-2 border border-base rounded-lg bg-surface-50 w-full transition-colors focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
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
					class="text-sm font-mono px-3 py-2 border border-base rounded-lg bg-surface-50 w-full resize-y transition-colors focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
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
		</div>

		<!-- Bulk conflict resolution -->
		{#if totalConflicts > 0}
			<div
				class="text-sm p-3 border border-amber-500/30 rounded-lg bg-amber-500/5 flex flex-wrap gap-3 items-center"
			>
				<div class="text-amber-600 flex gap-2 items-center dark:text-amber-400">
					<AlertCircle size={16} />
					<span class="font-medium"
						>{totalConflicts} conflict{totalConflicts !== 1 ? 's' : ''} found</span
					>
				</div>
				<div class="ml-auto p-1 rounded-lg bg-surface-100 flex gap-1 dark:bg-surface-800">
					<button
						onclick={() => setAllResolutions('keep')}
						class={[
							'text-xs font-medium px-3 py-1.5 rounded-md transition-colors',
							bulkResolution === 'keep'
								? 'bg-blue-500 text-white shadow-sm'
								: 'text-muted hover:text-base hover:bg-surface-200 dark:hover:bg-surface-700'
						]}
					>
						Keep All
					</button>
					<button
						onclick={() => setAllResolutions('replace')}
						class={[
							'text-xs font-medium px-3 py-1.5 rounded-md transition-colors',
							bulkResolution === 'replace'
								? 'bg-amber-500 text-white shadow-sm'
								: 'text-muted hover:text-base hover:bg-surface-200 dark:hover:bg-surface-700'
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
						<div class="gap-4 grid sm:grid-cols-2 sm:items-end">
							<div class="space-y-2">
								<span class="text-[10px] text-muted tracking-wider font-medium block uppercase"
									>Switch/State Group</span
								>
								<GroupedCombobox
									groups={groupOptions}
									value={selectedGroupId}
									placeholder="Select group..."
									id="{uid}-grp-{sc.container.id}"
									onchange={(v) => handleGroupSelect(sc.container.id, v)}
								/>
							</div>
							{#if selectedGroupId && sc.switches.length > 0}
								<div class="space-y-2">
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
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted"
					>{totalAssignments} assignment{totalAssignments !== 1 ? 's' : ''}</span
				>
			</div>
			<div class="space-y-2">
				{#each configured as sc (sc.container.id)}
					{@const items = previews.get(sc.container.id) ?? []}
					{@const expanded = expandedIds.has(sc.container.id)}
					{@const unmatched = sc.children.filter((c) => !items.some((p) => p.childId === c.id))}
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
							<div class="mt-3 pt-3 border-t border-base">
								{#if items.length > 0}
									<div class="pl-3 border-l-2 border-surface-200 space-y-2 dark:border-surface-700">
										{#each items as p (p.childId)}
											{@const res = itemResolutions.get(p.childId)}
											{@const willReplace = p.hasConflict && res === 'replace'}
											<div
												class={[
													'text-sm',
													p.hasConflict &&
														'p-2 -ml-3 pl-3 rounded-r-lg bg-amber-500/5 border-l-2 border-amber-500'
												]}
											>
												<div class="flex flex-wrap gap-2 items-center">
													<span class="text-muted truncate">{p.childName}</span>
													<span class="text-wwise">→</span>
													<span class="text-wwise font-medium">{p.switchName}</span>
													{#if p.hasConflict}
														<span
															class={[
																'text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0',
																willReplace
																	? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
																	: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
															]}
														>
															{willReplace ? 'replaces' : '+adds'}
														</span>
													{/if}
												</div>
												{#if p.hasConflict}
													<div class="text-xs mt-2 flex flex-wrap gap-2 items-center">
														<span class="text-amber-600 dark:text-amber-400">
															Currently assigned to: {p.existingSwitchNames.join(', ')}
														</span>
														<div class="ml-auto flex shrink-0 gap-1.5">
															<button
																onclick={() => setResolution(p.childId, 'keep')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	res !== 'replace'
																		? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Keep
															</button>
															<button
																onclick={() => setResolution(p.childId, 'replace')}
																class={[
																	'px-2.5 py-1 rounded-md font-medium border transition-colors',
																	res === 'replace'
																		? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
																		: 'border-base bg-surface-50 text-muted hover:bg-surface-100 dark:bg-surface-800 dark:hover:bg-surface-700'
																]}
															>
																Replace
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

								<!-- Unmatched children -->
								{#if unmatched.length > 0}
									<details class="mt-3 pt-3 border-t border-base">
										<summary
											class="text-xs text-muted cursor-pointer transition-colors hover:text-base"
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
