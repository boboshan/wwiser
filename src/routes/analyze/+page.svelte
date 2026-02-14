<script lang="ts">
	import { SvelteSet, SvelteMap } from 'svelte/reactivity';
	import { untrack } from 'svelte';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { historyStore } from '$lib/state/history.svelte';
	import {
		RefreshCw,
		Activity,
		ChevronDown,
		ChevronRight,
		Plus,
		X,
		TriangleAlert,
		CircleAlert,
		CircleCheck,
		Circle,
		Layers,
		GitFork,
		Star
	} from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge from '$lib/components/badge.svelte';
	import Combobox from '$lib/components/combobox.svelte';

	// ── Types ────────────────────────────────────────────────────────────

	interface ContainerAnalysis {
		container: WwiseObject;
		switchGroup: WwiseObject | null;
		defaultSwitch: WwiseObject | null;
		children: WwiseObject[];
		switches: WwiseObject[];
		// Raw mappings (normalized ids)
		childToSwitchIds: Map<string, string[]>; // normalizedChildId → switchId[]
		switchToChildIds: Map<string, string[]>; // normalizedSwitchId → childId[]
	}

	interface SwitchRow {
		sw: WwiseObject;
		assignedChildren: WwiseObject[];
		status: 'empty' | 'healthy' | 'shared';
	}

	interface ChildRow {
		child: WwiseObject;
		assignedSwitches: WwiseObject[];
		status: 'unassigned' | 'healthy' | 'multi';
	}

	type FilterKey = 'empty' | 'unassigned' | 'multi' | 'shared' | 'noDefault' | 'healthy';

	// ── State ────────────────────────────────────────────────────────────

	let selectedObjects = $state<WwiseObject[]>([]);
	let containers = $state<ContainerAnalysis[]>([]);
	let isLoading = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');
	let expandedIds = new SvelteSet<string>();

	// Inline editing
	let addingToSwitch = $state<string | null>(null); // switchId currently showing add dropdown
	let addingChildValue = $state<string | undefined>(undefined); // selected child in combobox
	let inlineLoading = $state<string | null>(null); // id of item being modified
	let editingDefault = $state<string | null>(null); // containerId currently editing default
	let editingDefaultValue = $state<string | undefined>(undefined);

	const uid = $props.id();

	// Filters — all on by default
	let filters = $state<Record<FilterKey, boolean>>({
		empty: true,
		unassigned: true,
		multi: true,
		shared: true,
		noDefault: true,
		healthy: true
	});

	// ── Helpers ──────────────────────────────────────────────────────────

	const isNullGuid = (id?: string) => !id || id === '{00000000-0000-0000-0000-000000000000}';
	const nid = (id: string) => id.replace(/[{}]/g, '').toLowerCase();

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function reloadAllContainers() {
		if (containers.length === 0 || !wwise.isConnected) return;
		try {
			containers = await Promise.all(
				containers.map((c) => loadContainerAnalysis(c.container))
			);
		} catch {
			// Reload failed — stale data is acceptable
		}
	}

	let prevUndoLabel: string | null | undefined;
	let prevRedoLabel: string | null | undefined;

	$effect(() => {
		const curUndo = historyStore.undoLabel;
		const curRedo = historyStore.redoLabel;

		if (prevUndoLabel === undefined) {
			prevUndoLabel = curUndo;
			prevRedoLabel = curRedo;
			return;
		}

		if (curUndo !== prevUndoLabel || curRedo !== prevRedoLabel) {
			prevUndoLabel = curUndo;
			prevRedoLabel = curRedo;
			const hasContainers = untrack(() => containers.length > 0);
			if (hasContainers) {
				reloadAllContainers();
			}
		}
	});

	// ── Derived analysis ─────────────────────────────────────────────────

	const configured = $derived(containers.filter((c) => !isNullGuid(c.switchGroup?.id)));
	const unconfigured = $derived(containers.filter((c) => isNullGuid(c.switchGroup?.id)));

	/** Per-container switch rows */
	const switchRows = $derived.by(() => {
		const map = new SvelteMap<string, SwitchRow[]>();
		for (const c of configured) {
			const rows: SwitchRow[] = c.switches.map((sw) => {
				const childIds = c.switchToChildIds.get(nid(sw.id)) ?? [];
				const assignedChildren = childIds
					.map((cid) => c.children.find((ch) => nid(ch.id) === cid))
					.filter(Boolean) as WwiseObject[];
				const status: SwitchRow['status'] =
					assignedChildren.length === 0
						? 'empty'
						: assignedChildren.length === 1
							? 'healthy'
							: 'shared';
				return { sw, assignedChildren, status };
			});
			map.set(c.container.id, rows);
		}
		return map;
	});

	/** Per-container child rows */
	const childRows = $derived.by(() => {
		const map = new SvelteMap<string, ChildRow[]>();
		for (const c of configured) {
			const rows: ChildRow[] = c.children.map((child) => {
				const switchIds = c.childToSwitchIds.get(nid(child.id)) ?? [];
				const assignedSwitches = switchIds
					.map((sid) => c.switches.find((sw) => nid(sw.id) === sid))
					.filter(Boolean) as WwiseObject[];
				const status: ChildRow['status'] =
					assignedSwitches.length === 0
						? 'unassigned'
						: assignedSwitches.length === 1
							? 'healthy'
							: 'multi';
				return { child, assignedSwitches, status };
			});
			map.set(c.container.id, rows);
		}
		return map;
	});

	/** Aggregated stats per container */
	const stats = $derived.by(() => {
		const map = new SvelteMap<
			string,
			{
				totalSwitches: number;
				totalChildren: number;
				emptySwitches: number;
				unassignedChildren: number;
				multiAssigned: number;
				sharedSwitches: number;
				healthySwitches: number;
				healthyChildren: number;
				noDefault: boolean;
				healthPercent: number;
			}
		>();
		for (const c of configured) {
			const sRows = switchRows.get(c.container.id) ?? [];
			const cRows = childRows.get(c.container.id) ?? [];

			const emptySwitches = sRows.filter((r) => r.status === 'empty').length;
			const sharedSwitches = sRows.filter((r) => r.status === 'shared').length;
			const healthySwitches = sRows.filter((r) => r.status === 'healthy').length;
			const unassignedChildren = cRows.filter((r) => r.status === 'unassigned').length;
			const multiAssigned = cRows.filter((r) => r.status === 'multi').length;
			const healthyChildren = cRows.filter((r) => r.status === 'healthy').length;
			const noDefault = !c.defaultSwitch;

			const total = sRows.length + cRows.length + 1; // +1 for default switch check
			const issues = emptySwitches + unassignedChildren + multiAssigned + sharedSwitches + (noDefault ? 1 : 0);
			const healthPercent = total > 0 ? Math.round(((total - issues) / total) * 100) : 100;

			map.set(c.container.id, {
				totalSwitches: sRows.length,
				totalChildren: cRows.length,
				emptySwitches,
				unassignedChildren,
				multiAssigned,
				sharedSwitches,
				healthySwitches,
				healthyChildren,
				noDefault,
				healthPercent: Math.max(0, Math.min(100, healthPercent))
			});
		}
		return map;
	});

	/** Global totals */
	const globalStats = $derived.by(() => {
		let empty = 0,
			unassigned = 0,
			multi = 0,
			shared = 0,
			noDefault = 0,
			healthy = 0;
		for (const s of stats.values()) {
			empty += s.emptySwitches;
			unassigned += s.unassignedChildren;
			multi += s.multiAssigned;
			shared += s.sharedSwitches;
			if (s.noDefault) noDefault++;
			healthy += s.healthySwitches + s.healthyChildren;
		}
		return { empty, unassigned, multi, shared, noDefault, healthy };
	});

	// ── Filter helpers ───────────────────────────────────────────────────

	function switchVisible(row: SwitchRow): boolean {
		if (row.status === 'empty') return filters.empty;
		if (row.status === 'shared') return filters.shared;
		return filters.healthy;
	}

	function childVisible(row: ChildRow): boolean {
		if (row.status === 'unassigned') return filters.unassigned;
		if (row.status === 'multi') return filters.multi;
		return filters.healthy;
	}

	function toggleFilter(key: FilterKey) {
		filters[key] = !filters[key];
	}

	// ── Data loading ─────────────────────────────────────────────────────

	async function loadSelection() {
		if (!wwise.isConnected) return;
		isLoading = true;
		statusMessage = '';
		addingToSwitch = null;
		try {
			selectedObjects = await wwise.getSelectedObjects();
			const valid = selectedObjects.filter((o) => o.type === 'SwitchContainer');
			if (valid.length === 0) {
				statusMessage = 'No switch containers selected';
				statusType = 'info';
				containers = [];
				return;
			}
			containers = await Promise.all(valid.map(loadContainerAnalysis));
			expandedIds.clear();
			for (const c of containers) {
				if (!isNullGuid(c.switchGroup?.id)) expandedIds.add(c.container.id);
			}
			statusMessage = `Loaded ${valid.length} switch container${valid.length !== 1 ? 's' : ''}`;
			statusType = 'info';
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to load';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	async function loadContainerAnalysis(container: WwiseObject): Promise<ContainerAnalysis> {
		let switchGroup: WwiseObject | null = null;
		try {
			switchGroup = await wwise.getSwitchGroupOrStateGroup(container.id);
		} catch {
			// no group
		}

		const children = await wwise.getChildren(container.id);
		let switches: WwiseObject[] = [];
		if (switchGroup?.id && !isNullGuid(switchGroup.id)) {
			try {
				switches = await wwise.getChildren(switchGroup.id);
			} catch {
				// failed
			}
		}

		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const childToSwitchIds = new Map<string, string[]>();
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const switchToChildIds = new Map<string, string[]>();

		try {
			const raw = await wwise.getSwitchContainerAssignments(container.id);
			for (const a of raw) {
				const childNid = nid(a.child);
				const switchNid = nid(a.stateOrSwitch);
				// child → switches
				const cArr = childToSwitchIds.get(childNid) ?? [];
				cArr.push(switchNid);
				childToSwitchIds.set(childNid, cArr);
				// switch → children
				const sArr = switchToChildIds.get(switchNid) ?? [];
				sArr.push(childNid);
				switchToChildIds.set(switchNid, sArr);
			}
		} catch {
			// failed to load assignments
		}

		let defaultSwitch: WwiseObject | null = null;
		if (switchGroup?.id && !isNullGuid(switchGroup.id)) {
			try {
				defaultSwitch = await wwise.getDefaultSwitchOrState(container.id);
				if (defaultSwitch && isNullGuid(defaultSwitch.id)) defaultSwitch = null;
			} catch {
				// failed to get default
			}
		}

		return { container, switchGroup, defaultSwitch, children, switches, childToSwitchIds, switchToChildIds };
	}

	async function reloadContainer(containerId: string) {
		const existing = containers.find((c) => c.container.id === containerId);
		if (!existing) return;
		try {
			const updated = await loadContainerAnalysis(existing.container);
			containers = containers.map((c) => (c.container.id === containerId ? updated : c));
		} catch {
			// reload failed silently
		}
	}

	// ── Inline editing ───────────────────────────────────────────────────

	async function addAssignment(containerId: string, childId: string, switchId: string) {
		inlineLoading = switchId;
		try {
			await wwise.beginUndoGroup();
			await wwise.assignSwitchContainerChild(containerId, childId, switchId);
			await wwise.endUndoGroup('Analyze: Add Assignment');
			await reloadContainer(containerId);
			addingToSwitch = null;
			addingChildValue = undefined;
		} catch (e) {
			try {
				await wwise.cancelUndoGroup();
			} catch {
				// cancel failed
			}
			statusMessage = e instanceof Error ? e.message : 'Failed to assign';
			statusType = 'error';
		} finally {
			inlineLoading = null;
		}
	}

	async function removeAssignment(containerId: string, childId: string, switchId: string) {
		inlineLoading = `${childId}-${switchId}`;
		try {
			await wwise.beginUndoGroup();
			await wwise.removeSwitchContainerAssignment(containerId, childId, switchId);
			await wwise.endUndoGroup('Analyze: Remove Assignment');
			await reloadContainer(containerId);
		} catch (e) {
			try {
				await wwise.cancelUndoGroup();
			} catch {
				// cancel failed
			}
			statusMessage = e instanceof Error ? e.message : 'Failed to remove';
			statusType = 'error';
		} finally {
			inlineLoading = null;
		}
	}

	async function setDefaultSwitch(containerId: string, switchId: string) {
		inlineLoading = `default-${containerId}`;
		try {
			await wwise.beginUndoGroup();
			await wwise.setDefaultSwitchOrState(containerId, switchId);
			await wwise.endUndoGroup('Analyze: Set Default Switch');
			await reloadContainer(containerId);
			editingDefault = null;
			editingDefaultValue = undefined;
		} catch (e) {
			try {
				await wwise.cancelUndoGroup();
			} catch {
				// cancel failed
			}
			statusMessage = e instanceof Error ? e.message : 'Failed to set default';
			statusType = 'error';
		} finally {
			inlineLoading = null;
		}
	}

	function toggleExpand(id: string) {
		if (expandedIds.has(id)) expandedIds.delete(id);
		else expandedIds.add(id);
	}

	function getUnassignedChildren(containerId: string): WwiseObject[] {
		const cRows = childRows.get(containerId) ?? [];
		return cRows.filter((r) => r.status === 'unassigned').map((r) => r.child);
	}

	function getAllChildren(containerId: string): WwiseObject[] {
		const c = containers.find((ct) => ct.container.id === containerId);
		return c?.children ?? [];
	}

	function getHealthColor(percent: number): string {
		if (percent >= 90) return 'text-green-500';
		if (percent >= 60) return 'text-amber-500';
		return 'text-red-500';
	}

	function getHealthBarColor(percent: number): string {
		if (percent >= 90) return 'bg-green-500';
		if (percent >= 60) return 'bg-amber-500';
		return 'bg-red-500';
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Audit switch container assignments — find empty switches, unassigned children, and conflicts.
		</p>
		<button
			onclick={loadSelection}
			disabled={!wwise.isConnected || isLoading}
			class="text-sm text-base font-medium px-4 rounded-lg bg-surface-200 flex shrink-0 gap-2 h-10 transition-colors items-center justify-center dark:bg-surface-800 hover:bg-surface-300 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-surface-700"
		>
			<RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
			{isLoading ? 'Loading...' : 'Get Selection'}
		</button>
	</div>

	<!-- Status message -->
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

	<!-- Unconfigured warning -->
	{#if unconfigured.length > 0}
		<Alert variant="warning">
			{unconfigured.length} container{unconfigured.length !== 1 ? 's have' : ' has'} no switch group configured.
			Use the <a href="/assign" class="underline font-medium">Assign</a> tool to configure them first.
		</Alert>
	{/if}

	<!-- Filter bar + global summary -->
	{#if configured.length > 0}
		<div class="p-4 border border-base rounded-xl bg-base space-y-4">
			<div class="flex flex-wrap gap-2">
				<button
					onclick={() => toggleFilter('empty')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.empty
							? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<Circle size={10} />
					Empty Switches
					{#if globalStats.empty > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15">
							{globalStats.empty}
						</span>
					{/if}
				</button>

				<button
					onclick={() => toggleFilter('unassigned')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.unassigned
							? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<TriangleAlert size={10} />
					Unassigned Children
					{#if globalStats.unassigned > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15">
							{globalStats.unassigned}
						</span>
					{/if}
				</button>

				<button
					onclick={() => toggleFilter('multi')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.multi
							? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<GitFork size={10} />
					Multi-Assigned
					{#if globalStats.multi > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/15">
							{globalStats.multi}
						</span>
					{/if}
				</button>

				<button
					onclick={() => toggleFilter('shared')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.shared
							? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<Layers size={10} />
					Shared Switches
					{#if globalStats.shared > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/15">
							{globalStats.shared}
						</span>
					{/if}
				</button>

				<button
					onclick={() => toggleFilter('noDefault')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.noDefault
							? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<Star size={10} />
					No Default
					{#if globalStats.noDefault > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-500/15">
							{globalStats.noDefault}
						</span>
					{/if}
				</button>

				<button
					onclick={() => toggleFilter('healthy')}
					class={[
						'text-xs font-medium px-3 py-1.5 rounded-full border transition-all flex gap-1.5 items-center',
						filters.healthy
							? 'border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400'
							: 'border-base bg-surface-50 text-muted dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700'
					]}
				>
					<CircleCheck size={10} />
					Healthy
					{#if globalStats.healthy > 0}
						<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15">
							{globalStats.healthy}
						</span>
					{/if}
				</button>
			</div>
		</div>
	{/if}

	<!-- Container analysis cards -->
	{#if configured.length > 0}
		<div class="space-y-3">
			{#each configured as c (c.container.id)}
				{@const s = stats.get(c.container.id)}
				{@const sRows = switchRows.get(c.container.id) ?? []}
				{@const cRows = childRows.get(c.container.id) ?? []}
				{@const expanded = expandedIds.has(c.container.id)}
				{@const visibleSwitches = sRows.filter(switchVisible)}
				{@const visibleUnassigned = cRows.filter(
					(r) => r.status === 'unassigned' && filters.unassigned
				)}
				{@const visibleMulti = cRows.filter((r) => r.status === 'multi' && filters.multi)}

				<div class="border border-base rounded-xl bg-base overflow-hidden">
					<!-- Container header -->
					<button
						onclick={() => toggleExpand(c.container.id)}
						class="text-left p-4 flex gap-3 w-full items-center hover:bg-surface-50 transition-colors dark:hover:bg-surface-800/50"
					>
						{#if expanded}
							<ChevronDown size={14} class="text-muted shrink-0" />
						{:else}
							<ChevronRight size={14} class="text-muted shrink-0" />
						{/if}

						<div class="flex flex-1 gap-2 min-w-0 items-center">
							<Badge variant="wwise">Switch Container</Badge>
							<span class="text-sm text-base font-medium truncate">{c.container.name}</span>
						</div>

						<span class="text-xs text-muted shrink-0 hidden sm:inline"
							>{c.switchGroup?.name ?? '—'}</span
						>

						<!-- Health indicator -->
						{#if s}
							<div class="flex shrink-0 gap-2 items-center">
								<div
									class="bg-surface-200 rounded-full h-1.5 w-16 overflow-hidden dark:bg-surface-700"
								>
									<div
										class={[
											'h-full rounded-full transition-all',
											getHealthBarColor(s.healthPercent)
										]}
										style="width: {s.healthPercent}%"
									></div>
								</div>
								<span class={['text-xs font-medium tabular-nums', getHealthColor(s.healthPercent)]}>
									{s.healthPercent}%
								</span>
							</div>
						{/if}
					</button>

					{#if expanded && s}
						<div class="px-4 pb-4 border-t border-base">
							<!-- Stats row -->
							<div class="gap-3 grid grid-cols-2 mt-4 sm:grid-cols-4 lg:grid-cols-6">
								<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
									<p class="text-lg text-base font-semibold m-0 tabular-nums">{s.totalSwitches}</p>
									<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Switches</p>
								</div>
								<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
									<p class="text-lg text-base font-semibold m-0 tabular-nums">{s.totalChildren}</p>
									<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Children</p>
								</div>
								{#if s.emptySwitches > 0}
									<div class="p-3 rounded-lg bg-red-500/5 border border-red-500/10">
										<p
											class="text-lg text-red-600 font-semibold m-0 tabular-nums dark:text-red-400"
										>
											{s.emptySwitches}
										</p>
										<p
											class="text-[10px] text-red-600/70 tracking-wider m-0 uppercase dark:text-red-400/70"
										>
											Empty
										</p>
									</div>
								{/if}
								{#if s.unassignedChildren > 0}
									<div class="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
										<p
											class="text-lg text-amber-600 font-semibold m-0 tabular-nums dark:text-amber-400"
										>
											{s.unassignedChildren}
										</p>
										<p
											class="text-[10px] text-amber-600/70 tracking-wider m-0 uppercase dark:text-amber-400/70"
										>
											Unassigned
										</p>
									</div>
								{/if}
								{#if s.multiAssigned > 0}
									<div class="p-3 rounded-lg bg-purple-500/5 border border-purple-500/10">
										<p
											class="text-lg text-purple-600 font-semibold m-0 tabular-nums dark:text-purple-400"
										>
											{s.multiAssigned}
										</p>
										<p
											class="text-[10px] text-purple-600/70 tracking-wider m-0 uppercase dark:text-purple-400/70"
										>
											Multi-Assigned
										</p>
									</div>
								{/if}
								{#if s.sharedSwitches > 0}
									<div class="p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
										<p
											class="text-lg text-blue-600 font-semibold m-0 tabular-nums dark:text-blue-400"
										>
											{s.sharedSwitches}
										</p>
										<p
											class="text-[10px] text-blue-600/70 tracking-wider m-0 uppercase dark:text-blue-400/70"
										>
											Shared
										</p>
									</div>
								{/if}
								{#if s.noDefault}
									<div class="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/10">
										<p
											class="text-lg text-yellow-600 font-semibold m-0 dark:text-yellow-400"
										>
											!
										</p>
										<p
											class="text-[10px] text-yellow-600/70 tracking-wider m-0 uppercase dark:text-yellow-400/70"
										>
											No Default
										</p>
									</div>
								{/if}
							</div>

							<!-- Default switch info -->
							{#if s.noDefault && filters.noDefault}
								{@const isEditingDefault = editingDefault === c.container.id}
								{@const defaultItems = c.switches.map((sw) => ({ label: sw.name, value: sw.id }))}
								<div class="mt-5">
									<div class="text-sm p-3 rounded-lg border border-yellow-500/15 bg-yellow-500/3">
										<div class="flex gap-2 items-center">
											<Star size={12} class="text-yellow-500 shrink-0" />
											<span class="text-yellow-700 flex-1 dark:text-yellow-300">No default switch/state assigned</span>
											{#if !isEditingDefault}
												<button
													onclick={() => { editingDefault = c.container.id; }}
													class="text-yellow-500 p-1 rounded-full transition-colors hover:text-yellow-700 hover:bg-yellow-500/10 dark:hover:text-yellow-300"
													title="Set default"
												>
													<Plus size={14} />
												</button>
											{/if}
										</div>
										{#if isEditingDefault}
											<div class="mt-2 pt-2 border-t border-yellow-500/20 flex gap-2 items-center">
												<div class="flex-1">
													<Combobox
														items={defaultItems}
														bind:value={editingDefaultValue}
														placeholder="Search switches…"
														id="{uid}-default-{c.container.id}"
														allowCustomValue={false}
														disabled={inlineLoading === `default-${c.container.id}`}
														inputClass="!border-surface-300 !h-8 dark:!border-surface-600"
														onchange={(val) => {
															if (val) setDefaultSwitch(c.container.id, val);
														}}
													/>
												</div>
												<button
													onclick={() => { editingDefault = null; editingDefaultValue = undefined; }}
													class="text-muted p-1.5 rounded-md transition-colors hover:bg-surface-200 dark:hover:bg-surface-700"
													title="Cancel"
												>
													<X size={14} />
												</button>
											</div>
										{/if}
									</div>
								</div>
							{:else if c.defaultSwitch}
								<div class="mt-5">
									<div class="text-sm p-3 rounded-lg border-base bg-surface-50 flex gap-2 items-center dark:bg-surface-800/30">
										<Star size={12} class="text-green-500 shrink-0" />
										<span class="text-muted">Default:</span>
										<span class="text-base font-medium">{c.defaultSwitch.name}</span>
									</div>
								</div>
							{/if}

							<!-- Switches section -->
							{#if visibleSwitches.length > 0}
								<div class="mt-5">
									<h4 class="text-[10px] text-muted tracking-wider font-medium mb-3 uppercase">
										Switches ({visibleSwitches.length}/{s.totalSwitches})
									</h4>
									<div class="space-y-1.5">
										{#each visibleSwitches as row (row.sw.id)}
											{@const isAdding = addingToSwitch === row.sw.id}
											<div
												class={[
													'text-sm p-3 rounded-lg border transition-colors',
													row.status === 'empty'
														? 'border-red-500/15 bg-red-500/3'
														: row.status === 'shared'
															? 'border-blue-500/15 bg-blue-500/3'
															: 'border-base bg-surface-50 dark:bg-surface-800/30'
												]}
											>
												<div class="flex gap-2 items-center">
													<!-- Status indicator -->
													{#if row.status === 'empty'}
														<Circle size={12} class="text-red-500 shrink-0" />
													{:else if row.status === 'shared'}
														<Layers size={12} class="text-blue-500 shrink-0" />
													{:else}
														<CircleCheck size={12} class="text-green-500 shrink-0" />
													{/if}

													<!-- Switch name -->
													<span
														class={[
															'font-medium truncate',
															row.status === 'empty'
																? 'text-red-600 dark:text-red-400'
																: 'text-base'
														]}
													>
														{row.sw.name}
													</span>

													<!-- Assigned children tags -->
													<div class="flex flex-1 flex-wrap gap-1.5 justify-end items-center">
														{#each row.assignedChildren as child (child.id)}
															{@const childRow = cRows.find((cr) => cr.child.id === child.id)}
															{@const isMulti = childRow?.status === 'multi'}
															{@const removing = inlineLoading === `${child.id}-${row.sw.id}`}
															<span
																class={[
																	'text-xs font-medium pl-2 pr-1 py-0.5 rounded-full flex gap-1 items-center group/tag',
																	isMulti
																		? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
																		: 'bg-surface-200 text-muted dark:bg-surface-700'
																]}
															>
																{child.name}
																{#if isMulti}
																	<GitFork size={10} class="shrink-0" />
																{/if}
																<button
																	onclick={(e) => {
																		e.stopPropagation();
																		removeAssignment(c.container.id, child.id, row.sw.id);
																	}}
																	disabled={removing}
																	class="text-current/40 p-0.5 rounded-full transition-colors hover:text-current hover:bg-black/10 disabled:opacity-50 dark:hover:bg-white/10"
																	title="Remove assignment"
																>
																	<X size={10} />
																</button>
															</span>
														{/each}

														<!-- Add button -->
														{#if !isAdding}
															<button
																onclick={(e) => {
																	e.stopPropagation();
																	addingToSwitch = row.sw.id;
																}}
																class={[
																	'p-1 rounded-full transition-colors',
																	row.status === 'empty'
																		? 'text-red-400 hover:text-red-600 hover:bg-red-500/10 dark:hover:text-red-300'
																		: 'text-muted/50 hover:text-muted hover:bg-surface-200 dark:hover:bg-surface-600'
																]}
																title="Assign a child"
															>
																<Plus size={14} />
															</button>
														{/if}
													</div>
												</div>

<!-- Inline add combobox -->
											{#if isAdding}
												{@const available = getAllChildren(c.container.id).filter(
													(child) => !row.assignedChildren.some((ac) => ac.id === child.id)
												)}
												{@const comboItems = available.map((child) => {
													const cr = cRows.find((r) => r.child.id === child.id);
													const suffix =
														cr?.status === 'unassigned'
															? ' (unassigned)'
															: cr?.status === 'multi'
																? ` (${cr.assignedSwitches.length} switches)`
																: '';
													return { label: child.name + suffix, value: child.id };
												})}
												<div
													class="mt-2 pt-2 border-t border-surface-700/30 flex gap-2 items-center"
												>
													<div class="flex-1">
														<Combobox
															items={comboItems}
															bind:value={addingChildValue}
															placeholder="Search children…"
															id="{uid}-add-{row.sw.id}"
															allowCustomValue={false}
															disabled={inlineLoading === row.sw.id}
															inputClass="!border-surface-300 !h-8 dark:!border-surface-600"
															onchange={(val) => {
																if (val) addAssignment(c.container.id, val, row.sw.id);
															}}
														/>
													</div>
													<button
														onclick={() => {
															addingToSwitch = null;
															addingChildValue = undefined;
														}}
															class="text-muted p-1.5 rounded-md transition-colors hover:bg-surface-200 dark:hover:bg-surface-700"
															title="Cancel"
														>
															<X size={14} />
														</button>
													</div>
												{/if}

												<!-- Empty hint -->
												{#if row.status === 'empty' && !isAdding}
													<p class="text-xs text-red-500/60 m-0 mt-1.5 ml-5">
														No children assigned
													</p>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Unassigned children section -->
							{#if visibleUnassigned.length > 0}
								<div class="mt-5">
									<h4
										class="text-[10px] text-amber-600 tracking-wider font-medium mb-3 uppercase dark:text-amber-400"
									>
										Unassigned Children ({visibleUnassigned.length})
									</h4>
									<div class="pl-3 border-l-2 border-amber-500/20 space-y-1">
										{#each visibleUnassigned as row (row.child.id)}
											<div class="text-sm flex gap-2 py-1 items-center">
												<TriangleAlert size={12} class="text-amber-500 shrink-0" />
												<span class="text-amber-700 truncate dark:text-amber-300"
													>{row.child.name}</span
												>
												<span class="text-xs text-amber-500/60">— not assigned to any switch</span>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Multi-assigned children section -->
							{#if visibleMulti.length > 0}
								<div class="mt-5">
									<h4
										class="text-[10px] text-purple-600 tracking-wider font-medium mb-3 uppercase dark:text-purple-400"
									>
										Multi-Assigned Children ({visibleMulti.length})
									</h4>
									<div class="pl-3 border-l-2 border-purple-500/20 space-y-2">
										{#each visibleMulti as row (row.child.id)}
											<div class="text-sm py-1">
												<div class="flex gap-2 items-center">
													<GitFork size={12} class="text-purple-500 shrink-0" />
													<span class="text-purple-700 font-medium truncate dark:text-purple-300"
														>{row.child.name}</span
													>
												</div>
												<div class="text-xs text-purple-500/70 mt-1 ml-5 flex flex-wrap gap-1">
													Assigned to:
													{#each row.assignedSwitches as sw, i (sw.id)}
														<span class="font-medium text-purple-600 dark:text-purple-400"
															>{sw.name}</span
														>{#if i < row.assignedSwitches.length - 1}<span>,</span>{/if}
													{/each}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- No results after filtering -->
							{#if visibleSwitches.length === 0 && visibleUnassigned.length === 0 && visibleMulti.length === 0}
								<p class="text-sm text-muted m-0 py-6 text-center">
									Nothing to show with current filters
								</p>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Not connected -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
