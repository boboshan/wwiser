<script lang="ts">
	import { untrack } from 'svelte';
	import { wwise, type WwiseObject, type ConflictResolution } from '$lib/wwise/connection.svelte';
	import { watchUndoRedo } from '$lib/state/undo-watcher.svelte';
	import { RefreshCw, CopyPlus, Trash2 } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';
	import Select, { type SelectItem } from '$lib/components/select.svelte';
	import { toaster } from '$lib/components/toast.svelte';

	// State
	let sourceObjects = $state<WwiseObject[]>([]);
	let targetObjects = $state<WwiseObject[]>([]);
	let isLoadingSources = $state(false);
	let isLoadingTargets = $state(false);
	let isExecuting = $state(false);
	let onNameConflict = $state<ConflictResolution>('rename');

	const conflictItems: SelectItem[] = [
		{ value: 'rename', label: 'Rename (auto-suffix)' },
		{ value: 'replace', label: 'Replace existing' },
		{ value: 'fail', label: 'Fail on conflict' },
		{ value: 'merge', label: 'Merge' }
	];

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function refreshObjects() {
		const currentSources = untrack(() => sourceObjects);
		const currentTargets = untrack(() => targetObjects);
		if ((currentSources.length === 0 && currentTargets.length === 0) || !wwise.isConnected) return;
		try {
			const allIds = [...currentSources.map((o) => o.id), ...currentTargets.map((o) => o.id)];
			const refreshed = await wwise.getObjects({ id: allIds }, ['id', 'name', 'type', 'path']);
			const byId = new Map(refreshed.map((o) => [o.id, o]));
			if (currentSources.length > 0) {
				sourceObjects = currentSources.map((o) => byId.get(o.id) ?? o);
			}
			if (currentTargets.length > 0) {
				targetObjects = currentTargets.map((o) => byId.get(o.id) ?? o);
			}
		} catch {
			// Refresh failed — stale data is acceptable
		}
	}

	watchUndoRedo(() => sourceObjects.length > 0 || targetObjects.length > 0, refreshObjects);

	// Derived
	const totalCopies = $derived(sourceObjects.length * targetObjects.length);
	const canExecute = $derived(
		wwise.isConnected && sourceObjects.length > 0 && targetObjects.length > 0 && !isExecuting
	);

	async function getSourceSelection() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}

		isLoadingSources = true;

		try {
			sourceObjects = await wwise.getSelectedObjects();
			toaster.create({ title: `Got ${sourceObjects.length} source object(s)`, type: 'info' });
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to get selection',
				type: 'error'
			});
		} finally {
			isLoadingSources = false;
		}
	}

	async function getTargetSelection() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}

		isLoadingTargets = true;

		try {
			targetObjects = await wwise.getSelectedObjects();
			toaster.create({ title: `Got ${targetObjects.length} target object(s)`, type: 'info' });
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to get selection',
				type: 'error'
			});
		} finally {
			isLoadingTargets = false;
		}
	}

	function clearSources() {
		sourceObjects = [];
	}

	function clearTargets() {
		targetObjects = [];
	}

	async function executeCopy() {
		if (!canExecute) return;

		isExecuting = true;

		try {
			await wwise.beginUndoGroup();

			let copiedCount = 0;

			for (const target of targetObjects) {
				for (const source of sourceObjects) {
					await wwise.copyObject(source.id, target.id, onNameConflict);
					copiedCount++;
				}
			}

			await wwise.endUndoGroup('Copy Objects');

			toaster.create({
				title: `Copied ${sourceObjects.length} object(s) into ${targetObjects.length} target(s) (${copiedCount} total)`,
				type: 'success'
			});
		} catch (error) {
			await wwise.cancelUndoGroup();
			toaster.create({
				title: error instanceof Error ? error.message : 'Copy operation failed',
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
			Copy selected objects into one or more target containers. First capture the sources, then
			select targets in Wwise.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button onclick={executeCopy} disabled={!canExecute} class="btn-action flex-1 sm:flex-none">
				<CopyPlus size={16} />
				{isExecuting ? 'Copying...' : 'Copy Objects'}
			</button>
		</div>
	</div>

	<!-- Source & Target panels -->
	<div class="gap-4 grid grid-cols-1 lg:grid-cols-2">
		<!-- Source Objects -->
		<div class="p-5 border border-base rounded-xl bg-base space-y-4">
			<div class="flex items-center justify-between">
				<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
					Source Objects
				</span>
				<div class="flex gap-2">
					{#if sourceObjects.length > 0}
						<button onclick={clearSources} class="btn-danger-sm">
							<Trash2 size={14} />
							Clear
						</button>
					{/if}
					<button
						onclick={getSourceSelection}
						disabled={!wwise.isConnected || isLoadingSources}
						class="btn-accent-sm"
					>
						<RefreshCw size={14} class={isLoadingSources ? 'animate-spin' : ''} />
						{isLoadingSources ? 'Loading...' : 'Get Selection'}
					</button>
				</div>
			</div>

			{#if sourceObjects.length > 0}
				<div class="border border-base rounded-lg bg-base overflow-hidden">
					<div class="max-h-64 overflow-y-auto">
						{#each sourceObjects as obj, i (obj.id)}
							<div class="px-4 py-2.5 border-b border-base flex gap-3 items-center last:border-b-0">
								<span class="text-xs text-muted shrink-0 w-5">{i + 1}</span>
								<Badge variant="wwise">{getTypeDisplayName(obj.type)}</Badge>
								<span class="text-sm text-base font-mono truncate">{obj.name}</span>
							</div>
						{/each}
					</div>
				</div>
				<p class="text-xs text-muted m-0">{sourceObjects.length} object(s) to copy</p>
			{:else}
				<div class="text-sm text-muted py-8 text-center">
					Select objects in Wwise, then click <strong>Get Selection</strong>
				</div>
			{/if}
		</div>

		<!-- Target Objects -->
		<div class="p-5 border border-base rounded-xl bg-base space-y-4">
			<div class="flex items-center justify-between">
				<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
					Target Containers
				</span>
				<div class="flex gap-2">
					{#if targetObjects.length > 0}
						<button onclick={clearTargets} class="btn-danger-sm">
							<Trash2 size={14} />
							Clear
						</button>
					{/if}
					<button
						onclick={getTargetSelection}
						disabled={!wwise.isConnected || isLoadingTargets}
						class="btn-accent-sm"
					>
						<RefreshCw size={14} class={isLoadingTargets ? 'animate-spin' : ''} />
						{isLoadingTargets ? 'Loading...' : 'Get Selection'}
					</button>
				</div>
			</div>

			{#if targetObjects.length > 0}
				<div class="border border-base rounded-lg bg-base overflow-hidden">
					<div class="max-h-64 overflow-y-auto">
						{#each targetObjects as obj, i (obj.id)}
							<div class="px-4 py-2.5 border-b border-base flex gap-3 items-center last:border-b-0">
								<span class="text-xs text-muted shrink-0 w-5">{i + 1}</span>
								<Badge variant="wwise">{getTypeDisplayName(obj.type)}</Badge>
								<span class="text-sm text-base font-mono truncate">{obj.name}</span>
							</div>
						{/each}
					</div>
				</div>
				<p class="text-xs text-muted m-0">{targetObjects.length} target container(s)</p>
			{:else}
				<div class="text-sm text-muted py-8 text-center">
					Select target containers in Wwise, then click <strong>Get Selection</strong>
				</div>
			{/if}
		</div>
	</div>

	<!-- Settings -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-5">
		<div class="space-y-2">
			<span class="text-[10px] text-muted tracking-wider font-medium block uppercase">
				Name Conflict
			</span>
			<div class="max-w-xs">
				<Select id="conflict-select" items={conflictItems} bind:value={onNameConflict} />
			</div>
		</div>
	</div>

	<!-- Preview -->
	{#if sourceObjects.length > 0 && targetObjects.length > 0}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted">
					{totalCopies} copy operation{totalCopies !== 1 ? 's' : ''}
				</span>
			</div>
			<div class="border border-base rounded-lg bg-base overflow-hidden">
				<div class="max-h-96 overflow-y-auto">
					{#each targetObjects as target (target.id)}
						<div class="px-4 py-3 border-b border-base last:border-b-0">
							<div class="mb-2 flex gap-2 items-center">
								<Badge variant="wwise">{getTypeDisplayName(target.type)}</Badge>
								<span class="text-sm text-base font-medium font-mono">{target.name}</span>
								<span class="text-xs text-muted ml-auto">
									receives {sourceObjects.length} object{sourceObjects.length !== 1 ? 's' : ''}
								</span>
							</div>
							<div class="ml-6 space-y-1">
								{#each sourceObjects as source (source.id)}
									<div class="flex gap-2 items-center">
										<span class="text-xs text-wwise">+</span>
										<Badge variant="wwise">{getTypeDisplayName(source.type)}</Badge>
										<span class="text-sm text-wwise font-mono truncate">{source.name}</span>
									</div>
								{/each}
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
