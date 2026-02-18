<script lang="ts">
	import { untrack } from 'svelte';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import type { ActionType } from '$lib/wwise/types';
	import {
		ACTION_TYPES,
		NEEDS_TARGET,
		NO_TARGET_ACTIONS,
		getActionTypeId,
		getTypeDisplayName
	} from '$lib/wwise/constants';
	import { watchUndoRedo } from '$lib/state/undo-watcher.svelte';
	import { RefreshCw, Layers, Trash2, Plus, ChevronRight } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge from '$lib/components/badge.svelte';
	import Select from '$lib/components/select.svelte';
	import Combobox, { type ComboboxItem } from '$lib/components/combobox.svelte';
	import { toaster } from '$lib/components/toast.svelte';

	// ── State ───────────────────────────────────────────────────────────

	let selectedEvents = $state<WwiseObject[]>([]);
	let actionType = $state<ActionType>('Play');
	let isLoading = $state(false);
	let isExecuting = $state(false);

	// Target object (specific target mode)
	let selectedTarget = $state<WwiseObject | null>(null);
	let isLoadingTarget = $state(false);

	// For switch/state, we fetch groups and their children
	let switchGroups = $state<WwiseObject[]>([]);
	let stateGroups = $state<WwiseObject[]>([]);
	let groupChildren = $state<WwiseObject[]>([]);
	let selectedGroupValue = $state('');
	let selectedChildValue = $state('');
	let isLoadingGroups = $state(false);
	let isLoadingGroupChildren = $state(false);

	// Game parameter targets
	let gameParameters = $state<WwiseObject[]>([]);
	let isLoadingGameParams = $state(false);
	let selectedGameParamValue = $state('');
	let gameParamTargetValue = $state('0');

	// ── Derived ─────────────────────────────────────────────────────────

	const needsTarget = $derived(!NO_TARGET_ACTIONS.has(actionType));

	const isSwitchOrState = $derived(actionType === 'SetSwitch' || actionType === 'SetState');

	const isGameParameter = $derived(actionType === 'SetGameParameter');

	const needsObjectTarget = $derived(needsTarget && !isSwitchOrState && !isGameParameter);

	const targetDescription = $derived(NEEDS_TARGET[actionType] ?? '');

	const actionLabel = $derived(
		ACTION_TYPES.find((a) => a.value === actionType)?.label ?? actionType
	);

	const hasValidTarget = $derived.by(() => {
		if (NO_TARGET_ACTIONS.has(actionType)) return true;
		if (isSwitchOrState) return !!selectedGroupValue && !!selectedChildValue;
		if (isGameParameter) return !!selectedGameParamValue;
		return !!selectedTarget;
	});

	const canExecute = $derived(
		wwise.isConnected && selectedEvents.length > 0 && !isExecuting && hasValidTarget
	);

	// Combobox items
	const switchGroupItems = $derived<ComboboxItem[]>(
		switchGroups.map((g) => ({ label: g.name, value: g.id }))
	);

	const stateGroupItems = $derived<ComboboxItem[]>(
		stateGroups.map((g) => ({ label: g.name, value: g.id }))
	);

	const groupChildItems = $derived<ComboboxItem[]>(
		groupChildren.map((c) => ({ label: c.name, value: c.id }))
	);

	const gameParameterItems = $derived<ComboboxItem[]>(
		gameParameters.map((g) => ({ label: g.name, value: g.id }))
	);

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function refreshObjects() {
		const current = untrack(() => selectedEvents);
		if (current.length === 0 || !wwise.isConnected) return;
		try {
			const refreshed = await wwise.getObjects({ id: current.map((o) => o.id) }, [
				'id',
				'name',
				'type',
				'path'
			]);
			const byId = new Map(refreshed.map((o) => [o.id, o]));
			selectedEvents = current.map((o) => byId.get(o.id) ?? o);
		} catch {
			// Refresh failed — stale data is acceptable
		}
	}

	watchUndoRedo(() => selectedEvents.length > 0, refreshObjects);

	// ── Data fetches ────────────────────────────────────────────────────

	async function getSelection() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}

		isLoading = true;
		try {
			const objects = await wwise.getSelectedObjects();
			// Filter to only Event types
			const events = objects.filter((o) => o.type === 'Event');
			if (events.length === 0 && objects.length > 0) {
				toaster.create({
					title: `Selected ${objects.length} object(s), but none are Events`,
					type: 'warning'
				});
			}
			selectedEvents = events;
			if (events.length > 0) {
				toaster.create({ title: `Got ${events.length} Event(s)`, type: 'info' });
			}
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to get selection',
				type: 'error'
			});
		} finally {
			isLoading = false;
		}
	}

	async function loadSwitchGroups() {
		if (switchGroups.length > 0) return;
		isLoadingGroups = true;
		try {
			switchGroups = await wwise.getAllSwitchGroups();
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to load switch groups',
				type: 'error'
			});
		} finally {
			isLoadingGroups = false;
		}
	}

	async function loadStateGroups() {
		if (stateGroups.length > 0) return;
		isLoadingGroups = true;
		try {
			stateGroups = await wwise.getAllStateGroups();
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to load state groups',
				type: 'error'
			});
		} finally {
			isLoadingGroups = false;
		}
	}

	async function loadGroupChildren(groupId: string) {
		if (!groupId) {
			groupChildren = [];
			return;
		}
		isLoadingGroupChildren = true;
		try {
			groupChildren = await wwise.getChildren(groupId, ['id', 'name', 'type', 'path']);
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to load group children',
				type: 'error'
			});
		} finally {
			isLoadingGroupChildren = false;
		}
	}

	async function loadGameParameters() {
		if (gameParameters.length > 0) return;
		isLoadingGameParams = true;
		try {
			gameParameters = await wwise.getObjects({ ofType: ['GameParameter'] }, [
				'id',
				'name',
				'type',
				'path'
			]);
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to load game parameters',
				type: 'error'
			});
		} finally {
			isLoadingGameParams = false;
		}
	}

	async function getTargetSelection() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}
		isLoadingTarget = true;
		try {
			const objects = await wwise.getSelectedObjects();
			if (objects.length === 0) {
				toaster.create({ title: 'No objects selected in Wwise', type: 'warning' });
				return;
			}
			if (objects.length > 1) {
				toaster.create({ title: 'Using first selected object as target', type: 'info' });
			}
			selectedTarget = objects[0];
			toaster.create({
				title: `Target: ${objects[0].name} (${getTypeDisplayName(objects[0].type)})`,
				type: 'info'
			});
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to get selection',
				type: 'error'
			});
		} finally {
			isLoadingTarget = false;
		}
	}

	// ── Reactivity ──────────────────────────────────────────────────────

	// Load groups when action type changes to SetSwitch/SetState
	$effect(() => {
		if (actionType === 'SetSwitch') {
			loadSwitchGroups();
		} else if (actionType === 'SetState') {
			loadStateGroups();
		} else if (actionType === 'SetGameParameter') {
			loadGameParameters();
		}
	});

	// Load children when group is selected
	$effect(() => {
		if (selectedGroupValue) {
			loadGroupChildren(selectedGroupValue);
		}
	});

	// Reset target state when action type changes
	let previousActionType = 'Play' as ActionType;
	$effect(() => {
		if (actionType !== previousActionType) {
			previousActionType = actionType;
			selectedTarget = null;
			selectedGroupValue = '';
			selectedChildValue = '';
			selectedGameParamValue = '';
			groupChildren = [];
		}
	});

	// ── Actions ─────────────────────────────────────────────────────────

	function clearEvents() {
		selectedEvents = [];
	}

	async function execute() {
		if (!canExecute) return;

		isExecuting = true;
		let successCount = 0;
		let failCount = 0;

		try {
			await wwise.beginUndoGroup();

			for (const event of selectedEvents) {
				try {
					// Build the create args with all properties and references set atomically
					const createArgs: Record<string, unknown> = {
						parent: event.id,
						type: 'Action',
						name: `${actionLabel}`,
						onNameConflict: 'rename',
						'@ActionType': getActionTypeId(actionType)
					};

					// Set target references based on action type
					if (isSwitchOrState && selectedGroupValue && selectedChildValue) {
						createArgs['@Target'] = selectedGroupValue;
						createArgs['@SwitchValue'] = selectedChildValue;
					} else if (isGameParameter && selectedGameParamValue) {
						createArgs['@Target'] = selectedGameParamValue;
					} else if (needsObjectTarget && selectedTarget) {
						createArgs['@Target'] = selectedTarget.id;
					}

					const created = await wwise.call<WwiseObject>('ak.wwise.core.object.create', createArgs);

					if (created) {
						successCount++;
					}
				} catch (err) {
					failCount++;
					console.error(`Failed to add action to ${event.name}:`, err);
				}
			}

			await wwise.endUndoGroup('Batch Add Event Action');

			if (successCount > 0 && failCount === 0) {
				toaster.create({
					title: `Added "${actionLabel}" action to ${successCount} Event(s)`,
					type: 'success'
				});
			} else if (successCount > 0) {
				toaster.create({
					title: `Added to ${successCount}, failed on ${failCount} Event(s)`,
					type: 'warning'
				});
			} else {
				toaster.create({
					title: `Failed to add action to all Events`,
					type: 'error'
				});
			}
		} catch (error) {
			await wwise.cancelUndoGroup();
			toaster.create({
				title: error instanceof Error ? error.message : 'Batch operation failed',
				type: 'error'
			});
		} finally {
			isExecuting = false;
		}
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Add the same Action to many Events at once. Select Events in Wwise, pick an action type and
			target, then execute.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button onclick={execute} disabled={!canExecute} class="btn-action flex-1 sm:flex-none">
				<Layers size={16} />
				{isExecuting ? 'Adding...' : `Add to ${selectedEvents.length} Event(s)`}
			</button>
		</div>
	</div>

	<!-- Events panel -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-4">
		<div class="flex items-center justify-between">
			<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
				Selected Events
			</span>
			<div class="flex gap-2">
				{#if selectedEvents.length > 0}
					<button onclick={clearEvents} class="btn-danger-sm">
						<Trash2 size={14} />
						Clear
					</button>
				{/if}
				<button
					onclick={getSelection}
					disabled={!wwise.isConnected || isLoading}
					class="btn-accent-sm"
				>
					<RefreshCw size={14} class={isLoading ? 'animate-spin' : ''} />
					{isLoading ? 'Loading...' : 'Get Selection'}
				</button>
			</div>
		</div>

		{#if selectedEvents.length > 0}
			<div class="border border-base rounded-lg bg-base overflow-hidden">
				<div class="max-h-64 overflow-y-auto">
					{#each selectedEvents as obj, i (obj.id)}
						<div class="px-4 py-3 border-b border-base flex gap-3 items-center last:border-b-0">
							<span class="text-xs text-muted shrink-0 w-5">{i + 1}</span>
							<Badge variant="wwise">{getTypeDisplayName(obj.type)}</Badge>
							<span class="text-sm text-base font-mono truncate">{obj.name}</span>
						</div>
					{/each}
				</div>
			</div>
			<p class="text-xs text-muted m-0">{selectedEvents.length} Event(s) selected</p>
		{:else}
			<div class="text-sm text-muted py-8 text-center">
				Select Events in Wwise, then click <strong>Get Selection</strong>
			</div>
		{/if}
	</div>

	<!-- Action Configuration -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-5">
		<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
			Action Configuration
		</span>

		<!-- Action Type -->
		<div class="space-y-2">
			<label for="action-type-select" class="text-xs text-muted font-medium block">
				Action Type
			</label>
			<div class="max-w-xs">
				<Select id="action-type-select" items={ACTION_TYPES} bind:value={actionType} />
			</div>
		</div>

		<!-- Target picker (for non switch/state/game-param actions that need a target) -->
		{#if needsObjectTarget}
			<div class="space-y-3">
				<div class="flex gap-3 items-center">
					<span class="text-xs text-muted font-medium">Target ({targetDescription})</span>
					<div class="flex gap-2">
						{#if selectedTarget}
							<button onclick={() => (selectedTarget = null)} class="btn-danger-sm">
								<Trash2 size={14} />
								Clear
							</button>
						{/if}
						<button
							onclick={getTargetSelection}
							disabled={!wwise.isConnected || isLoadingTarget}
							class="btn-accent-sm"
						>
							<RefreshCw size={14} class={isLoadingTarget ? 'animate-spin' : ''} />
							{isLoadingTarget ? 'Loading...' : 'Get Target from Wwise'}
						</button>
					</div>
				</div>
				{#if selectedTarget}
					<div class="px-4 py-2.5 border border-base rounded-lg bg-base flex gap-3 items-center">
						<Badge variant="wwise">{getTypeDisplayName(selectedTarget.type)}</Badge>
						<span class="text-sm text-base font-mono truncate">{selectedTarget.name}</span>
						<span class="text-xs text-muted ml-auto truncate">{selectedTarget.path}</span>
					</div>
				{:else}
					<div
						class="text-sm text-muted py-4 text-center border border-base rounded-lg border-dashed"
					>
						Select a target object in Wwise, then click <strong>Get Target from Wwise</strong>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Switch/State group picker -->
		{#if isSwitchOrState}
			<div class="gap-5 grid grid-cols-1 sm:grid-cols-2">
				<!-- Group -->
				<div class="space-y-2">
					<label for="group-select" class="text-xs text-muted font-medium block">
						{actionType === 'SetSwitch' ? 'Switch Group' : 'State Group'}
					</label>
					<Combobox
						id="group-select"
						items={actionType === 'SetSwitch' ? switchGroupItems : stateGroupItems}
						bind:value={selectedGroupValue}
						placeholder={isLoadingGroups
							? 'Loading...'
							: `Select ${actionType === 'SetSwitch' ? 'Switch' : 'State'} Group...`}
						allowCustomValue={false}
					/>
				</div>

				<!-- Value -->
				<div class="space-y-2">
					<label for="child-select" class="text-xs text-muted font-medium block">
						{actionType === 'SetSwitch' ? 'Switch Value' : 'State Value'}
					</label>
					<Combobox
						id="child-select"
						items={groupChildItems}
						bind:value={selectedChildValue}
						placeholder={isLoadingGroupChildren
							? 'Loading...'
							: selectedGroupValue
								? `Select value...`
								: 'Select a group first'}
						disabled={!selectedGroupValue}
						allowCustomValue={false}
					/>
				</div>
			</div>

			{#if selectedGroupValue && selectedChildValue}
				{@const group = (actionType === 'SetSwitch' ? switchGroups : stateGroups).find(
					(g) => g.id === selectedGroupValue
				)}
				{@const child = groupChildren.find((c) => c.id === selectedChildValue)}
				{#if group && child}
					<div class="text-xs text-muted flex gap-1.5 items-center">
						<Badge variant="blue">{group.name}</Badge>
						<ChevronRight size={12} />
						<Badge variant="green">{child.name}</Badge>
					</div>
				{/if}
			{/if}
		{/if}

		<!-- Game Parameter picker -->
		{#if isGameParameter}
			<div class="gap-5 grid grid-cols-1 sm:grid-cols-2">
				<div class="space-y-2">
					<label for="gameparam-select" class="text-xs text-muted font-medium block">
						Game Parameter
					</label>
					<Combobox
						id="gameparam-select"
						items={gameParameterItems}
						bind:value={selectedGameParamValue}
						placeholder={isLoadingGameParams ? 'Loading...' : 'Select Game Parameter...'}
						allowCustomValue={false}
					/>
				</div>
				<div class="space-y-2">
					<label for="gameparam-value" class="text-xs text-muted font-medium block"> Value </label>
					<input
						id="gameparam-value"
						type="number"
						bind:value={gameParamTargetValue}
						class="text-sm px-3 border border-base rounded-lg bg-surface-50 h-10 w-full focus-visible:outline-none focus-visible:border-wwise dark:bg-surface-900 focus-visible:ring-2 dark:focus-visible:ring-wwise/30"
						step="any"
					/>
				</div>
			</div>
		{/if}
	</div>

	<!-- Preview -->
	{#if selectedEvents.length > 0 && canExecute}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted">
					{selectedEvents.length} action(s) to create
				</span>
			</div>
			<div class="border border-base rounded-lg bg-base overflow-hidden">
				<div class="max-h-96 overflow-y-auto">
					{#each selectedEvents as event, i (event.id)}
						<div class="px-4 py-3 border-b border-base flex gap-3 items-center last:border-b-0">
							<span class="text-xs text-muted shrink-0 w-5">{i + 1}</span>
							<Badge variant="wwise">{getTypeDisplayName(event.type)}</Badge>
							<span class="text-sm text-base font-mono truncate">{event.name}</span>
							<ChevronRight size={14} class="text-muted shrink-0" />
							<div class="flex shrink-0 gap-1.5 items-center">
								<Plus size={12} class="text-wwise" />
								<Badge variant="green">{actionLabel}</Badge>
								{#if isSwitchOrState && selectedChildValue}
									{@const child = groupChildren.find((c) => c.id === selectedChildValue)}
									{#if child}
										<ChevronRight size={10} class="text-muted" />
										<Badge variant="blue">{child.name}</Badge>
									{/if}
								{:else if isGameParameter && selectedGameParamValue}
									{@const param = gameParameters.find((g) => g.id === selectedGameParamValue)}
									{#if param}
										<ChevronRight size={10} class="text-muted" />
										<Badge variant="blue">{param.name} = {gameParamTargetValue}</Badge>
									{/if}
								{:else if needsObjectTarget && selectedTarget}
									<ChevronRight size={10} class="text-muted" />
									<Badge variant="blue">{selectedTarget.name}</Badge>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
