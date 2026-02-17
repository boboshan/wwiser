<script lang="ts">
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { isNullGuid, normalizeId as nid } from '$lib/wwise/helpers';
	import {
		RefreshCw,
		ChevronDown,
		ChevronRight,
		Search,
		Zap,
		Play,
		GitBranch,
		Layers,
		Shuffle,
		Volume2,
		Box,
		CircleAlert,
		CircleCheck,
		Circle,
		Blend,
		Folder,
		CircleHelp
	} from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import { getTypeDisplayName } from '$lib/components/badge.svelte';
	import Combobox from '$lib/components/combobox.svelte';
	import { toaster } from '$lib/components/toast.svelte';
	import { watchUndoRedo } from '$lib/state/undo-watcher.svelte';

	// ── Types ────────────────────────────────────────────────────────────

	type NodeType =
		| 'event'
		| 'action'
		| 'switch-container'
		| 'random-container'
		| 'blend-container'
		| 'actor-mixer'
		| 'sound'
		| 'switch-group'
		| 'switch'
		| 'container'
		| 'folder'
		| 'music'
		| 'unknown';

	type NodeStatus = 'healthy' | 'gap' | 'warning' | 'neutral';

	interface TraceNode {
		id: string;
		object: WwiseObject;
		nodeType: NodeType;
		status: NodeStatus;
		children: TraceNode[];
		meta?: string;
		actionType?: string;
	}

	// ── Constants ────────────────────────────────────────────────────────

	const MAX_DEPTH = 12;

	// ── ActionType resolution ─────────────────────────────────────────────

	/** Cached map: numeric ActionType → display name, built dynamically from WAAPI */
	let actionTypeMap: Record<number, string> | null = null;

	/** Fetch ActionType enum values from Wwise once, then cache */
	async function ensureActionTypeMap(): Promise<void> {
		if (actionTypeMap) return;
		try {
			// Ask WAAPI for the ActionType property schema on an Action object
			const info = await wwise.call<{
				restriction?: { enumeration?: Array<{ value: number; displayName: string }> };
			}>('ak.wwise.core.object.getPropertyInfo', {
				classId: 3, // Action
				property: 'ActionType'
			});
			if (info?.restriction?.enumeration) {
				actionTypeMap = {};
				for (const e of info.restriction.enumeration) {
					actionTypeMap[e.value] = e.displayName;
				}
				return;
			}
		} catch {
			// getPropertyInfo may not exist in older WAAPI versions
		}
		// Fallback: minimal known map
		actionTypeMap = { 1: 'Play', 2: 'Stop' };
	}

	/** Resolve a numeric ActionType value to a display label */
	async function resolveActionType(actionId: string, targetType?: string): Promise<string> {
		await ensureActionTypeMap();
		try {
			const at = await wwise.getProperty<number>(actionId, 'ActionType');
			if (at !== null && actionTypeMap![at]) return actionTypeMap![at];
		} catch {
			// Property read failed
		}
		// Last-resort fallback: infer from target type
		if (targetType) {
			switch (targetType) {
				case 'GameParameter':
					return 'Set Game Parameter';
				case 'State':
					return 'Set State';
				case 'Switch':
					return 'Set Switch';
				case 'Bus':
				case 'AuxBus':
					return 'Set Bus Volume';
				case 'Event':
					return 'Post Event';
			}
		}
		return 'Action';
	}

	// ── State ────────────────────────────────────────────────────────────

	let events = $state<WwiseObject[]>([]);
	let eventsLoaded = $state(false);
	let eventsLoading = $state(false);
	let selectedEventId = $state<string | undefined>(undefined);
	let previousEventId: string | undefined = undefined;
	let traceRoot = $state<TraceNode | null>(null);
	let isTracing = $state(false);
	let collapsedIds = $state(new Set<string>());

	const uid = $props.id();

	// ── Derived stats ────────────────────────────────────────────────────

	const traceStats = $derived.by(() => {
		if (!traceRoot) return null;
		let total = 0;
		let gaps = 0;
		let sounds = 0;
		let switches = 0;
		let containers = 0;

		function walk(node: TraceNode) {
			total++;
			if (node.status === 'gap') gaps++;
			if (node.nodeType === 'sound') sounds++;
			if (node.nodeType === 'switch') switches++;
			if (
				node.nodeType === 'switch-container' ||
				node.nodeType === 'random-container' ||
				node.nodeType === 'blend-container' ||
				node.nodeType === 'actor-mixer'
			)
				containers++;
			for (const c of node.children) walk(c);
		}
		walk(traceRoot);
		return { total, gaps, sounds, switches, containers };
	});

	const eventItems = $derived(
		events.map((e) => ({
			label: e.name,
			value: e.id
		}))
	);

	// Auto-trace when event selection changes
	$effect(() => {
		if (selectedEventId && selectedEventId !== previousEventId) {
			previousEventId = selectedEventId;
			traceSelected();
		}
	});

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function reloadTrace() {
		if (!traceRoot || !wwise.isConnected) return;
		const eventObj = traceRoot.object;
		try {
			traceRoot = await buildTrace(eventObj);
		} catch {
			// Stale data is acceptable
		}
	}

	watchUndoRedo(() => traceRoot !== null, reloadTrace);

	// ── Data loading ────────────────────────────────────────────────────

	let nodeCounter = 0;
	function nextId(): string {
		return `tn-${++nodeCounter}`;
	}

	async function loadEvents() {
		if (eventsLoading) return;
		eventsLoading = true;
		try {
			events = await wwise.getObjects({ ofType: ['Event'] }, ['id', 'name', 'type', 'path']);
			events.sort((a, b) => a.name.localeCompare(b.name));
			eventsLoaded = true;
		} catch (e) {
			toaster.create({
				title: e instanceof Error ? e.message : 'Failed to load events',
				type: 'error'
			});
		} finally {
			eventsLoading = false;
		}
	}

	async function getSelection() {
		if (!wwise.isConnected) return;
		isTracing = true;
		try {
			const sel = await wwise.getSelectedObjects();
			const eventObj = sel.find((o) => o.type === 'Event');
			if (!eventObj) {
				toaster.create({ title: 'No events selected', type: 'warning' });
				return;
			}
			selectedEventId = eventObj.id;
			traceRoot = await buildTrace(eventObj);
			collapsedIds = new Set();
			toaster.create({ title: `Traced: ${eventObj.name}`, type: 'info' });
		} catch (e) {
			toaster.create({
				title: e instanceof Error ? e.message : 'Trace failed',
				type: 'error'
			});
		} finally {
			isTracing = false;
		}
	}

	async function traceSelected() {
		if (!selectedEventId) return;
		const eventObj = events.find((e) => e.id === selectedEventId);
		if (!eventObj) return;
		isTracing = true;
		try {
			traceRoot = await buildTrace(eventObj);
			collapsedIds = new Set();
			toaster.create({ title: `Traced: ${eventObj.name}`, type: 'info' });
		} catch (e) {
			toaster.create({
				title: e instanceof Error ? e.message : 'Trace failed',
				type: 'error'
			});
		} finally {
			isTracing = false;
		}
	}

	// ── Core trace logic ─────────────────────────────────────────────────

	async function buildTrace(event: WwiseObject): Promise<TraceNode> {
		nodeCounter = 0;
		const visited = new Set<string>();
		const actions = await wwise.getChildren(event.id);

		const childNodes: TraceNode[] = [];

		for (const action of actions) {
			let target: WwiseObject | null = null;
			try {
				target = await wwise.getReference(action.id, 'Target');
			} catch {
				// No target
			}

			// Resolve target fully to get its type for fallback inference
			let resolvedTarget = target;
			if (target && !isNullGuid(target.id) && !target.type) {
				const full = await wwise.getObject(target.id);
				if (full) resolvedTarget = full;
			}

			const actionType = await resolveActionType(action.id, resolvedTarget?.type);

			if (target && !isNullGuid(target.id)) {
				// Merge action into its target — the action type becomes a prefix
				const targetNode = await traceObject(target, 1, visited);
				targetNode.actionType = actionType;
				childNodes.push(targetNode);
			} else {
				childNodes.push({
					id: nextId(),
					object: action,
					nodeType: 'action',
					status: 'neutral',
					children: [],
					actionType
				});
			}
		}

		return {
			id: nextId(),
			object: event,
			nodeType: 'event',
			status: childNodes.some(hasDeepGap) ? 'gap' : 'neutral',
			children: childNodes
		};
	}

	function hasDeepGap(node: TraceNode): boolean {
		if (node.status === 'gap') return true;
		return node.children.some(hasDeepGap);
	}

	async function traceObject(
		obj: WwiseObject,
		depth: number,
		visited: Set<string>
	): Promise<TraceNode> {
		// Re-fetch full object if type is missing (references often omit it)
		if (!obj.type) {
			const full = await wwise.getObject(obj.id);
			if (full) obj = full;
		}

		const objNid = nid(obj.id);

		// Cycle detection
		if (visited.has(objNid)) {
			return {
				id: nextId(),
				object: obj,
				nodeType: 'unknown',
				status: 'warning',
				children: [],
				meta: 'Cycle detected'
			};
		}

		// Max depth guard
		if (depth > MAX_DEPTH) {
			return {
				id: nextId(),
				object: obj,
				nodeType: 'unknown',
				status: 'warning',
				children: [],
				meta: 'Max depth reached'
			};
		}

		visited.add(objNid);

		let result: TraceNode;

		switch (obj.type) {
			case 'SwitchContainer':
				result = await traceSwitchContainer(obj, depth, visited);
				break;
			case 'RandomSequenceContainer':
				result = await traceGenericContainer(obj, 'random-container', depth, visited);
				break;
			case 'BlendContainer':
				result = await traceGenericContainer(obj, 'blend-container', depth, visited);
				break;
			case 'ActorMixer':
				result = await traceGenericContainer(obj, 'actor-mixer', depth, visited);
				break;
			case 'Sound':
			case 'AudioFileSource':
				result = {
					id: nextId(),
					object: obj,
					nodeType: 'sound',
					status: 'healthy',
					children: []
				};
				break;
			case 'MusicSwitchContainer':
			case 'MusicRanSeqContainer':
			case 'MusicSegment':
			case 'MusicTrack':
				result = await traceGenericContainer(obj, 'music', depth, visited);
				break;
			case 'Folder':
			case 'WorkUnit':
				result = await traceGenericContainer(obj, 'folder', depth, visited);
				break;
			default: {
				// Known leaf types that naturally have no children
				const leafType = [
					'GameParameter',
					'State',
					'Bus',
					'AuxBus',
					'Effect',
					'Attenuation'
				].includes(obj.type);
				if (leafType) {
					result = {
						id: nextId(),
						object: obj,
						nodeType: 'unknown',
						status: 'neutral',
						children: []
					};
				} else {
					result = await traceGenericContainer(obj, 'unknown', depth, visited);
				}
				break;
			}
		}

		visited.delete(objNid);
		return result;
	}

	async function traceSwitchContainer(
		container: WwiseObject,
		depth: number,
		visited: Set<string>
	): Promise<TraceNode> {
		let switchGroup: WwiseObject | null = null;
		try {
			switchGroup = await wwise.getSwitchGroupOrStateGroup(container.id);
		} catch {
			// No group
		}

		const children = await wwise.getChildren(container.id);

		if (!switchGroup || isNullGuid(switchGroup.id)) {
			// No switch group — just list children
			const childNodes = await Promise.all(
				children.map((c) => traceObject(c, depth + 1, visited))
			);
			return {
				id: nextId(),
				object: container,
				nodeType: 'switch-container',
				status: 'warning',
				children: childNodes,
				meta: 'No Switch Group configured'
			};
		}

		const switches = await wwise.getChildren(switchGroup.id);
		let assignments: Array<{ child: string; stateOrSwitch: string }> = [];
		try {
			assignments = await wwise.getSwitchContainerAssignments(container.id);
		} catch {
			// Failed to load assignments
		}

		// Build switch → children map
		const switchToChildren = new Map<string, WwiseObject[]>();
		for (const sw of switches) {
			switchToChildren.set(nid(sw.id), []);
		}
		for (const a of assignments) {
			const swNid = nid(a.stateOrSwitch);
			const child = children.find((c) => nid(c.id) === nid(a.child));
			if (child) {
				const arr = switchToChildren.get(swNid) ?? [];
				arr.push(child);
				switchToChildren.set(swNid, arr);
			}
		}

		// Build switch nodes
		let hasGap = false;
		const switchNodes: TraceNode[] = [];

		for (const sw of switches) {
			const assignedChildren = switchToChildren.get(nid(sw.id)) ?? [];
			const isEmpty = assignedChildren.length === 0;
			if (isEmpty) hasGap = true;

			const childTraceNodes = await Promise.all(
				assignedChildren.map((c) => traceObject(c, depth + 2, visited))
			);

			switchNodes.push({
				id: nextId(),
				object: sw,
				nodeType: 'switch',
				status: isEmpty ? 'gap' : 'healthy',
				children: childTraceNodes,
				meta: isEmpty ? 'No children assigned' : undefined
			});
		}

		// Check for unassigned children
		const assignedChildIds = new Set(assignments.map((a) => nid(a.child)));
		const unassigned = children.filter((c) => !assignedChildIds.has(nid(c.id)));
		const unassignedNodes: TraceNode[] = [];
		for (const u of unassigned) {
			unassignedNodes.push({
				id: nextId(),
				object: u,
				nodeType: getNodeType(u.type),
				status: 'warning',
				children: [],
				meta: 'Not assigned to any switch'
			});
		}

		// Switch group node containing all switch nodes
		const switchGroupNode: TraceNode = {
			id: nextId(),
			object: switchGroup,
			nodeType: 'switch-group',
			status: hasGap ? 'gap' : 'healthy',
			children: [...switchNodes, ...unassignedNodes]
		};

		return {
			id: nextId(),
			object: container,
			nodeType: 'switch-container',
			status: hasGap ? 'gap' : 'healthy',
			children: [switchGroupNode]
		};
	}

	async function traceGenericContainer(
		obj: WwiseObject,
		nodeType: NodeType,
		depth: number,
		visited: Set<string>
	): Promise<TraceNode> {
		const children = await wwise.getChildren(obj.id);
		const childNodes = await Promise.all(
			children.map((c) => traceObject(c, depth + 1, visited))
		);
		const hasGap = childNodes.some((c) => c.status === 'gap');
		return {
			id: nextId(),
			object: obj,
			nodeType,
			status: children.length === 0 && nodeType !== 'sound' ? 'warning' : hasGap ? 'gap' : 'neutral',
			children: childNodes
		};
	}

	function getNodeType(type: string): NodeType {
		switch (type) {
			case 'SwitchContainer':
				return 'switch-container';
			case 'RandomSequenceContainer':
				return 'random-container';
			case 'BlendContainer':
				return 'blend-container';
			case 'ActorMixer':
				return 'actor-mixer';
			case 'Sound':
			case 'AudioFileSource':
				return 'sound';
			case 'Folder':
			case 'WorkUnit':
				return 'folder';
			default:
				return 'unknown';
		}
	}

	// ── UI helpers ───────────────────────────────────────────────────────

	function toggleCollapse(nodeId: string) {
		const next = new Set(collapsedIds);
		if (next.has(nodeId)) {
			next.delete(nodeId);
		} else {
			next.add(nodeId);
		}
		collapsedIds = next;
	}

	function expandAll() {
		collapsedIds = new Set();
	}

	function collapseAll() {
		if (!traceRoot) return;
		const ids = new Set<string>();
		function walk(node: TraceNode) {
			if (node.children.length > 0) ids.add(node.id);
			for (const c of node.children) walk(c);
		}
		walk(traceRoot);
		collapsedIds = ids;
	}

	function getNodeIcon(node: TraceNode): { icon: typeof Zap; color: string } {
		switch (node.nodeType) {
			case 'event':
				return { icon: Zap, color: 'text-wwise' };
			case 'action':
				return { icon: Play, color: 'text-surface-400' };
			case 'switch-container':
				return {
					icon: GitBranch,
					color: node.status === 'gap' ? 'text-red-500' : 'text-purple-500'
				};
			case 'switch-group':
				return { icon: Layers, color: 'text-violet-500' };
			case 'switch':
				return {
					icon: node.status === 'gap' ? Circle : CircleCheck,
					color: node.status === 'gap' ? 'text-red-500' : 'text-green-500'
				};
			case 'random-container':
				return { icon: Shuffle, color: 'text-cyan-500' };
			case 'blend-container':
				return { icon: Blend, color: 'text-teal-500' };
			case 'actor-mixer':
				return { icon: Box, color: 'text-surface-500' };
			case 'sound':
				return { icon: Volume2, color: 'text-green-500' };
			case 'music':
				return { icon: Volume2, color: 'text-indigo-500' };
			case 'folder':
				return { icon: Folder, color: 'text-amber-500' };
			default:
				return { icon: CircleHelp, color: 'text-surface-400' };
		}
	}

	function getTypeLabel(node: TraceNode): string {
		switch (node.nodeType) {
			case 'event':
			case 'action':
				return '';
			case 'switch-container':
				return 'Switch Container';
			case 'switch-group': {
				const count = node.children.filter((c) => c.nodeType === 'switch').length;
				return `${count} switch${count !== 1 ? 'es' : ''}`;
			}
			case 'switch':
				if (node.status === 'gap') return '';
				return node.children.length > 0
					? `${node.children.length} child${node.children.length !== 1 ? 'ren' : ''}`
					: '';
			case 'sound':
				return 'Sound';
			default:
				return getTypeDisplayName(node.object.type);
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Trace the signal path from an Event through containers to audio files. Coverage gaps are highlighted in red.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			{#if !eventsLoaded}
				<button onclick={loadEvents} disabled={!wwise.isConnected || eventsLoading} class="btn-secondary flex-1 sm:flex-none">
					<Search size={16} />
					{eventsLoading ? 'Loading…' : 'Load Events'}
				</button>
			{/if}
			<button
				onclick={getSelection}
				disabled={!wwise.isConnected || isTracing}
				class="btn-secondary flex-1 sm:flex-none"
			>
				<RefreshCw size={16} class={isTracing ? 'animate-spin' : ''} />
				{isTracing ? 'Tracing…' : 'Get Selection'}
			</button>
		</div>
	</div>

	<!-- Event picker -->
	{#if wwise.isConnected && eventsLoaded}
		<div class="p-5 border border-base rounded-xl bg-base">
			<div class="flex gap-3 items-end">
				<div class="flex-1">
					<label
						for="{uid}-event-picker"
						class="text-[10px] text-muted tracking-wider font-medium mb-1.5 block uppercase"
					>
						Event
					</label>
					<Combobox
						items={eventItems}
						bind:value={selectedEventId}
						placeholder="Search events…"
						id="{uid}-event-picker"
						allowCustomValue={false}
					/>
				</div>
				{#if isTracing}
					<div class="shrink-0 flex items-center gap-2 text-sm text-muted px-2">
						<RefreshCw size={14} class="animate-spin" />
						Tracing…
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Stats summary -->
	{#if traceRoot && traceStats}
		<div class="p-5 border border-base rounded-xl bg-base">
			<div class="flex gap-3 items-end">
				<div class="gap-3 grid flex-1 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
					<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
						<p class="text-lg text-base font-semibold m-0 tabular-nums">{traceStats.total}</p>
						<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Nodes</p>
					</div>
					<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
						<p class="text-lg text-base font-semibold m-0 tabular-nums">{traceStats.containers}</p>
						<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Containers</p>
					</div>
					<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
						<p class="text-lg text-purple-500 font-semibold m-0 tabular-nums">{traceStats.switches}</p>
						<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Switches</p>
					</div>
					<div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-800/50">
						<p class="text-lg text-green-500 font-semibold m-0 tabular-nums">{traceStats.sounds}</p>
						<p class="text-[10px] text-muted tracking-wider m-0 uppercase">Sounds</p>
					</div>
					{#if traceStats.gaps > 0}
						<div class="p-3 border border-red-500/10 rounded-lg bg-red-500/5">
							<p class="text-lg text-red-600 font-semibold m-0 tabular-nums dark:text-red-400">{traceStats.gaps}</p>
							<p class="text-[10px] text-red-600/70 tracking-wider m-0 uppercase dark:text-red-400/70">Gaps</p>
						</div>
					{/if}
				</div>
				<div class="flex gap-1 shrink-0 self-end">
					<button
						onclick={expandAll}
						class="text-xs text-muted px-2 py-1 rounded-md bg-hover transition-colors hover:text-base"
					>
						Expand
					</button>
					<button
						onclick={collapseAll}
						class="text-xs text-muted px-2 py-1 rounded-md bg-hover transition-colors hover:text-base"
					>
						Collapse
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Trace tree -->
	{#if traceRoot}
		<div class="border border-base rounded-xl bg-base overflow-hidden">
			<div class="p-3">
				{#snippet renderNode(node: TraceNode, depth: number)}
					{@const nodeIcon = getNodeIcon(node)}
					{@const Icon = nodeIcon.icon}
					{@const typeLabel = getTypeLabel(node)}
					{@const isCollapsed = collapsedIds.has(node.id)}
					{@const hasChildren = node.children.length > 0}
					{@const isGap = node.status === 'gap'}
					{@const isWarning = node.status === 'warning'}

					<div>
						<button
							onclick={() => hasChildren && toggleCollapse(node.id)}
							class={[
								'flex w-full items-center gap-1.5 pl-2 pr-3 py-1 text-left text-sm rounded-md transition-colors',
								isGap && node.nodeType === 'switch'
									? 'bg-red-500/5 hover:bg-red-500/10'
									: 'hover:bg-surface-50 dark:hover:bg-surface-800/50'
							]}
							disabled={!hasChildren}
						>
							<!-- Chevron -->
							<span class="w-3.5 shrink-0 flex items-center justify-center">
								{#if hasChildren}
									{#if isCollapsed}
										<ChevronRight size={11} class="text-muted/60" />
									{:else}
										<ChevronDown size={11} class="text-muted/60" />
									{/if}
								{/if}
							</span>

							<!-- Type icon (no background) -->
							<Icon size={14} class={nodeIcon.color} />

							<!-- Action type prefix for merged action→target -->
							{#if node.actionType}
								<span class="text-[11px] text-muted/70 font-medium shrink-0">{node.actionType}</span>
								{#if node.nodeType !== 'action'}
									<span class="text-muted/30 text-[10px]">→</span>
								{/if}
							{/if}

							<!-- Name -->
							{#if node.nodeType !== 'action'}
								<span
									class={[
										'font-medium truncate',
										isGap && node.nodeType === 'switch'
											? 'text-red-600 dark:text-red-400'
											: isWarning
												? 'text-amber-600 dark:text-amber-400'
												: 'text-base'
									]}
								>
									{node.object.name}
								</span>
							{/if}

							<!-- Right-aligned contextual info -->
							{#if isGap && node.nodeType === 'switch' && node.meta}
								<span class="text-[11px] text-red-500 font-medium ml-auto shrink-0">{node.meta}</span>
							{:else if isWarning && node.meta}
								<span class="text-[11px] text-amber-500 ml-auto shrink-0">{node.meta}</span>
							{:else if typeLabel}
								<span class="text-[11px] text-muted/40 ml-auto shrink-0">{typeLabel}</span>
							{/if}
						</button>

						<!-- Children with tree connector line -->
						{#if hasChildren && !isCollapsed}
							<div class="ml-5 pl-3 border-l border-surface-200/60 dark:border-surface-700/60">
								{#each node.children as child (child.id)}
									{@render renderNode(child, depth + 1)}
								{/each}
							</div>
						{/if}
					</div>
				{/snippet}

				{@render renderNode(traceRoot, 0)}
			</div>
		</div>
	{/if}

	<!-- Not connected -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
