<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { watchUndoRedo } from '$lib/state/undo-watcher.svelte';
	import { isNullGuid, normalizeId } from '$lib/wwise/helpers';
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
	import { toaster } from '$lib/components/toast.svelte';
	import GroupedCombobox, {
		type GroupedComboboxGroup
	} from '$lib/components/grouped-combobox.svelte';

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

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function reloadAllContainers() {
		const current = untrack(() => switchContainers);
		if (current.length === 0 || !wwise.isConnected) return;
		try {
			switchContainers = await Promise.all(current.map((sc) => loadContainerInfo(sc.container)));
		} catch {
			// Reload failed — stale data is acceptable
		}
	}

	watchUndoRedo(() => switchContainers.length > 0, reloadAllContainers);

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
				toaster.create({ title: 'Select switch containers or their children', type: 'info' });
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
			toaster.create({
				title: `Found ${containerMap.size} container(s) with ${blankCount} blank switch(es)`,
				type: 'info'
			});
		} catch (e) {
			toaster.create({
				title: e instanceof Error ? e.message : 'Failed to get selection',
				type: 'error'
			});
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
		await configureContainer(containerId, groupId);
	}

	async function configureContainer(containerId: string, groupId?: string) {
		const gid = groupId ?? pendingGroups.get(containerId);
		if (!gid) return;
		isLoading = true;
		try {
			await wwise.beginUndoGroup();
			await wwise.setSwitchGroupOrStateGroup(containerId, gid);
			await wwise.endUndoGroup('Configure Switch Group');

			const container = switchContainers.find((sc) => sc.container.id === containerId)?.container;
			if (container) {
				const newInfo = await loadContainerInfo(container);
				switchContainers = switchContainers.map((sc) =>
					sc.container.id === containerId ? newInfo : sc
				);
			}
			pendingGroups.delete(containerId);
			pendingDefaults.delete(containerId);
			toaster.create({ title: 'Container configured', type: 'success' });
		} catch (e) {
			await wwise.cancelUndoGroup();
			toaster.create({
				title: e instanceof Error ? e.message : 'Failed to configure',
				type: 'error'
			});
		} finally {
			isLoading = false;
		}
	}

	// ── Execute ───────────────────────────────────────────────────────────

	async function execute() {
		if (totalAssignments === 0) return;
		isExecuting = true;
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
			toaster.create({ title: `Filled ${assigned} assignment(s)`, type: 'success' });
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
			toaster.create({ title: e instanceof Error ? e.message : 'Fill failed', type: 'error' });
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
				class="btn-secondary flex-1 sm:flex-none"
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
				class="btn-action flex-1 sm:flex-none"
			>
				<ListChecks size={16} />
				{isExecuting ? 'Filling...' : `Fill${totalAssignments > 0 ? ` (${totalAssignments})` : ''}`}
			</button>
		</div>
	</div>

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
				class="text-[10px] text-muted tracking-wider font-medium mb-4 flex gap-1.5 uppercase items-center"
			>
				<Settings2 size={14} />
				Needs Configuration ({unconfigured.length})
			</h3>
			<div class="space-y-3">
				{#each unconfigured as sc (sc.container.id)}
					{@const selectedGroupId = pendingGroups.get(sc.container.id)}
					<div class="p-4 border border-base rounded-xl bg-base space-y-4">
						<div class="flex gap-2 items-center">
							<Badge variant="wwise">Switch Container</Badge>
							<span class="text-sm font-medium truncate">{sc.container.name}</span>
						</div>
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

			<div class="space-y-3">
				{#each configured as sc (sc.container.id)}
					{@const expanded = expandedIds.has(sc.container.id)}
					{@const selected = selectedChildren.get(sc.container.id)}
					{@const selectedCount = selected?.size ?? 0}
					<div class="border border-base rounded-xl bg-base overflow-hidden">
						<!-- Container header -->
						<button
							onclick={() => toggleExpand(sc.container.id)}
							class="p-4 text-left flex gap-3 w-full transition-colors items-center hover:bg-surface-50 dark:hover:bg-surface-800/50"
						>
							{#if expanded}
								<ChevronDown size={14} class="text-muted shrink-0" />
							{:else}
								<ChevronRight size={14} class="text-muted shrink-0" />
							{/if}
							<div class="flex flex-1 gap-2 min-w-0 items-center">
								<Badge variant="wwise">Switch Container</Badge>
								<span class="text-sm text-base font-medium truncate">{sc.container.name}</span>
							</div>
							<span class="text-xs text-muted shrink-0 hidden sm:inline"
								>{sc.switchGroup?.name ?? '—'}</span
							>
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
							<div
								class="px-4 pb-4 pt-4 border-t border-base"
								class:space-y-4={sc.blankSwitches.length > 0}
							>
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
									<details class="mt-3 pt-3 border-t border-base">
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
