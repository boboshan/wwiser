<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import {
		RefreshCw,
		ListChecks,
		ChevronDown,
		ChevronRight,
		Check,
		SkipForward,
		Settings2
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
		blankSwitches: WwiseObject[];
		assignedSwitches: { sw: WwiseObject; childNames: string[] }[];
	}

	// State
	let selectedObjects = $state<WwiseObject[]>([]);
	let switchContainers = $state<SwitchContainerInfo[]>([]);
	let orphanObjects = $state<WwiseObject[]>([]);
	let isLoading = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');

	// Per-container selected children to fill with
	let selectedChildren = new SvelteMap<string, SvelteSet<string>>();
	let expandedIds = new SvelteSet<string>();
	let skippedSwitches = new SvelteSet<string>();

	// Group configuration for unconfigured containers
	let allSwitchGroups = $state<WwiseObject[]>([]);
	let allStateGroups = $state<WwiseObject[]>([]);
	let pendingGroups = new SvelteMap<string, string>();
	let pendingDefaults = new SvelteMap<string, string>();

	const uid = $props.id();

	// Helpers
	const isNullGuid = (id?: string) => !id || id === '{00000000-0000-0000-0000-000000000000}';
	const normalizeId = (id: string) => id.replace(/[{}]/g, '').toLowerCase();

	// Derived
	const unconfigured = $derived(switchContainers.filter((sc) => isNullGuid(sc.switchGroup?.id)));
	const configured = $derived(switchContainers.filter((sc) => !isNullGuid(sc.switchGroup?.id)));

	const groupOptions = $derived<GroupedComboboxGroup[]>([
		{
			label: 'Switch Groups',
			items: allSwitchGroups.map((g) => ({ label: g.name, value: g.id }))
		},
		{
			label: 'State Groups',
			items: allStateGroups.map((g) => ({ label: g.name, value: g.id }))
		}
	]);

	const totalAssignments = $derived.by(() => {
		let count = 0;
		for (const sc of configured) {
			const selected = selectedChildren.get(sc.container.id);
			if (!selected || selected.size === 0) continue;
			for (const sw of sc.blankSwitches) {
				if (!skippedSwitches.has(sw.id)) count += selected.size;
			}
		}
		return count;
	});

	const totalSkippedSwitches = $derived.by(() => {
		let count = 0;
		for (const sc of configured) {
			for (const sw of sc.blankSwitches) {
				if (skippedSwitches.has(sw.id)) count++;
			}
		}
		return count;
	});

	// ── Load ──────────────────────────────────────────────────────────────

	async function loadSelection() {
		if (!wwise.isConnected) return;
		isLoading = true;
		statusMessage = '';
		try {
			selectedObjects = await wwise.getSelectedObjects();

			// Separate: switch containers vs children of switch containers
			const containerMap = new SvelteMap<string, WwiseObject>();
			const preSelected = new SvelteMap<string, SvelteSet<string>>();
			const skipped: WwiseObject[] = [];

			for (const obj of selectedObjects) {
				if (obj.type === 'SwitchContainer') {
					containerMap.set(obj.id, obj);
				} else if (obj.parent?.type === 'SwitchContainer') {
					// Child of a switch container — auto-detect parent
					if (!containerMap.has(obj.parent.id)) {
						containerMap.set(obj.parent.id, obj.parent);
					}
					const set = preSelected.get(obj.parent.id) ?? new SvelteSet<string>();
					set.add(obj.id);
					preSelected.set(obj.parent.id, set);
				} else {
					skipped.push(obj);
				}
			}

			orphanObjects = skipped;

			if (containerMap.size === 0) {
				statusMessage = 'Select switch containers or their children';
				statusType = 'info';
				switchContainers = [];
				return;
			}

			[allSwitchGroups, allStateGroups] = await Promise.all([
				wwise.getAllSwitchGroups(),
				wwise.getAllStateGroups()
			]);

			switchContainers = await Promise.all([...containerMap.values()].map(loadContainerInfo));

			// Pre-select children from Wwise selection
			selectedChildren.clear();
			for (const [containerId, childIds] of preSelected) {
				selectedChildren.set(containerId, new SvelteSet(childIds));
			}

			pendingGroups.clear();
			pendingDefaults.clear();
			skippedSwitches.clear();

			// Expand all configured containers
			expandedIds.clear();
			for (const sc of switchContainers) {
				if (!isNullGuid(sc.switchGroup?.id)) expandedIds.add(sc.container.id);
			}

			const blankCount = switchContainers.reduce((s, sc) => s + sc.blankSwitches.length, 0);
			statusMessage = `Found ${containerMap.size} container(s) with ${blankCount} blank switch(es)`;
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

		// Build switch → children map from existing assignments
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local variable, not reactive state
		const switchToChildren = new Map<string, string[]>();
		try {
			const raw = await wwise.getSwitchContainerAssignments(container.id);
			for (const a of raw) {
				const switchNid = normalizeId(a.stateOrSwitch);
				const childNid = normalizeId(a.child);
				const childObj = children.find((c) => normalizeId(c.id) === childNid);
				if (childObj) {
					const arr = switchToChildren.get(switchNid) ?? [];
					arr.push(childObj.name);
					switchToChildren.set(switchNid, arr);
				}
			}
		} catch {
			// Failed to get existing assignments
		}

		const blankSwitches: WwiseObject[] = [];
		const assignedSwitches: { sw: WwiseObject; childNames: string[] }[] = [];
		for (const sw of switches) {
			const assigned = switchToChildren.get(normalizeId(sw.id));
			if (assigned && assigned.length > 0) {
				assignedSwitches.push({ sw, childNames: assigned });
			} else {
				blankSwitches.push(sw);
			}
		}

		return {
			container,
			switchGroup,
			defaultSwitch,
			children,
			switches,
			blankSwitches,
			assignedSwitches
		};
	}

	// ── Actions ───────────────────────────────────────────────────────────

	function toggleChild(containerId: string, childId: string) {
		let set = selectedChildren.get(containerId);
		if (!set) {
			set = new SvelteSet<string>();
			selectedChildren.set(containerId, set);
		}
		if (set.has(childId)) set.delete(childId);
		else set.add(childId);
	}

	function selectAllChildren(containerId: string, children: WwiseObject[]) {
		selectedChildren.set(containerId, new SvelteSet(children.map((c) => c.id)));
	}

	function deselectAllChildren(containerId: string) {
		selectedChildren.set(containerId, new SvelteSet<string>());
	}

	function toggleSkipSwitch(switchId: string) {
		if (skippedSwitches.has(switchId)) skippedSwitches.delete(switchId);
		else skippedSwitches.add(switchId);
	}

	function toggleExpand(id: string) {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	async function handleGroupSelect(containerId: string, groupId: string) {
		pendingGroups.set(containerId, groupId);
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

	// ── Execute ───────────────────────────────────────────────────────────

	async function execute() {
		if (totalAssignments === 0) return;
		isExecuting = true;
		statusMessage = 'Filling...';
		statusType = 'info';
		try {
			await wwise.beginUndoGroup();
			let assigned = 0;

			for (const sc of configured) {
				const selected = selectedChildren.get(sc.container.id);
				if (!selected || selected.size === 0) continue;

				for (const sw of sc.blankSwitches) {
					if (skippedSwitches.has(sw.id)) continue;
					for (const childId of selected) {
						try {
							await wwise.assignSwitchContainerChild(sc.container.id, childId, sw.id);
							assigned++;
						} catch (e) {
							if (!(e instanceof Error && e.message.includes('already exists'))) throw e;
						}
					}
				}
			}

			await wwise.endUndoGroup('Fill Blank Switches');
			statusMessage = `Filled ${assigned} assignment(s)`;
			statusType = 'success';
			selectedObjects = [];
			switchContainers = [];
			selectedChildren.clear();
			skippedSwitches.clear();
		} catch (e) {
			try {
				await wwise.cancelUndoGroup();
			} catch {
				// Failed to cancel undo group
			}
			statusMessage = e instanceof Error ? e.message : 'Fill failed';
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
			Fill blank switches by assigning selected children to every unassigned switch.
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
				<ListChecks size={16} />
				{isExecuting ? 'Filling...' : `Fill${totalAssignments > 0 ? ` (${totalAssignments})` : ''}`}
			</button>
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

	<!-- Skipped warning -->
	{#if orphanObjects.length > 0}
		<Alert variant="warning">
			{orphanObjects.length} object(s) skipped — not switch containers or their children
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
									compact
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

	<!-- Configured containers -->
	{#if configured.length > 0}
		<section class="space-y-3">
			<div class="flex gap-3 items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<div class="text-xs flex gap-2 items-center">
					{#if totalSkippedSwitches > 0}
						<span class="text-surface-500">{totalSkippedSwitches} skipped</span>
						<span class="text-surface-300 dark:text-surface-600">&middot;</span>
					{/if}
					<span class="text-muted">{totalAssignments} to fill</span>
				</div>
			</div>

			<div class="space-y-2">
				{#each configured as sc (sc.container.id)}
					{@const expanded = expandedIds.has(sc.container.id)}
					{@const selected = selectedChildren.get(sc.container.id)}
					{@const selectedCount = selected?.size ?? 0}
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
									sc.blankSwitches.length > 0
										? 'bg-wwise/10 text-wwise'
										: 'bg-green-500/10 text-green-600 dark:text-green-400'
								]}
							>
								{sc.blankSwitches.length > 0 ? `${sc.blankSwitches.length} blank` : 'All filled'}
							</span>
						</button>

						<!-- Expanded content -->
						{#if expanded}
							<div class="mt-3 pt-3 border-t border-base space-y-4">
								{#if sc.blankSwitches.length === 0}
									<p class="text-sm text-green-600 m-0 py-2 text-center dark:text-green-400">
										All switches have children assigned
									</p>
								{:else}
									<!-- Children selector -->
									<div class="space-y-2">
										<div class="flex items-center justify-between">
											<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
												Children to Assign ({selectedCount}/{sc.children.length})
											</span>
											<div class="flex gap-1.5">
												<button
													onclick={() => selectAllChildren(sc.container.id, sc.children)}
													class="text-xs text-muted font-medium px-2 py-0.5 rounded transition-colors hover:text-surface-900 hover:bg-surface-100 dark:hover:text-surface-100 dark:hover:bg-surface-800"
												>
													All
												</button>
												<button
													onclick={() => deselectAllChildren(sc.container.id)}
													class="text-xs text-muted font-medium px-2 py-0.5 rounded transition-colors hover:text-surface-900 hover:bg-surface-100 dark:hover:text-surface-100 dark:hover:bg-surface-800"
												>
													None
												</button>
											</div>
										</div>
										{#if sc.children.length > 0}
											<div
												class="border border-base rounded-lg max-h-48 overflow-y-auto divide-surface-200 divide-y dark:divide-surface-800"
											>
												{#each sc.children as child (child.id)}
													{@const isSelected = selected?.has(child.id) ?? false}
													<label
														class={[
															'text-sm flex gap-2 px-3 py-2 cursor-pointer items-center transition-colors',
															isSelected
																? 'bg-wwise/5'
																: 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
														]}
													>
														<input
															type="checkbox"
															checked={isSelected}
															onchange={() => toggleChild(sc.container.id, child.id)}
															class="accent-wwise"
														/>
														<span class="truncate">{child.name}</span>
													</label>
												{/each}
											</div>
										{:else}
											<p class="text-xs text-muted m-0">No children in this container</p>
										{/if}
									</div>

									<!-- Blank switches -->
									<div class="space-y-2">
										<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
											Blank Switches ({sc.blankSwitches.length})
										</span>
										<div
											class="pl-3 border-l-2 border-surface-200 space-y-1.5 dark:border-surface-700"
										>
											{#each sc.blankSwitches as sw (sw.id)}
												{@const isSkipped = skippedSwitches.has(sw.id)}
												<div
													class={[
														'text-sm flex gap-2 items-center py-1',
														isSkipped && 'opacity-50'
													]}
												>
													<button
														onclick={() => toggleSkipSwitch(sw.id)}
														aria-label={isSkipped ? 'Include this switch' : 'Skip this switch'}
														class={[
															'p-1 rounded transition-colors shrink-0 group/skip',
															isSkipped
																? 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300'
																: 'text-green-500 hover:text-green-600 dark:hover:text-green-400'
														]}
														title={isSkipped ? 'Click to include' : 'Click to skip'}
													>
														{#if isSkipped}
															<SkipForward size={16} />
														{:else}
															<Check size={16} class="group-hover/skip:hidden" />
															<SkipForward size={16} class="hidden group-hover/skip:block" />
														{/if}
													</button>
													<span class={isSkipped ? 'text-surface-400 line-through' : 'text-base'}>
														{sw.name}
													</span>
													{#if selectedCount > 0 && !isSkipped}
														<span class="text-xs text-wwise ml-auto">
															&larr; {selectedCount} child{selectedCount !== 1 ? 'ren' : ''}
														</span>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Already assigned (collapsible) -->
								{#if sc.assignedSwitches.length > 0}
									<details class="pt-3 border-t border-base">
										<summary
											class="text-xs text-green-600 cursor-pointer transition-colors dark:text-green-400 hover:text-green-500"
										>
											{sc.assignedSwitches.length} switch{sc.assignedSwitches.length !== 1
												? 'es'
												: ''} already assigned
										</summary>
										<div class="mt-2 pl-3 border-l-2 border-green-500/20 space-y-1">
											{#each sc.assignedSwitches as a (a.sw.id)}
												<div class="text-xs flex gap-2 items-center">
													<span class="text-muted truncate">{a.sw.name}</span>
													<span class="text-green-500">&rarr;</span>
													<span class="text-green-600 font-medium dark:text-green-400"
														>{a.childNames.join(', ')}</span
													>
													<Check size={12} class="text-green-500 shrink-0" />
												</div>
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
