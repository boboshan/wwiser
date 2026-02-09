<script lang="ts">
	import { wwise, type WwiseObject, type ConflictResolution } from '$lib/wwise/connection.svelte';
	import { RefreshCw, CopyPlus, Trash2 } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';
	import Select, { type SelectItem } from '$lib/components/select.svelte';

	// State
	let sourceObjects = $state<WwiseObject[]>([]);
	let targetObjects = $state<WwiseObject[]>([]);
	let isLoadingSources = $state(false);
	let isLoadingTargets = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');
	let onNameConflict = $state<ConflictResolution>('rename');

	const conflictItems: SelectItem[] = [
		{ value: 'rename', label: 'Rename (auto-suffix)' },
		{ value: 'replace', label: 'Replace existing' },
		{ value: 'fail', label: 'Fail on conflict' },
		{ value: 'merge', label: 'Merge' }
	];

	// Derived
	const totalCopies = $derived(sourceObjects.length * targetObjects.length);
	const canExecute = $derived(
		wwise.isConnected && sourceObjects.length > 0 && targetObjects.length > 0 && !isExecuting
	);

	async function getSourceSelection() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		isLoadingSources = true;
		statusMessage = 'Fetching source selection...';
		statusType = 'info';

		try {
			sourceObjects = await wwise.getSelectedObjects();
			statusMessage = `Got ${sourceObjects.length} source object(s)`;
			statusType = 'info';
		} catch (error) {
			statusMessage = error instanceof Error ? error.message : 'Failed to get selection';
			statusType = 'error';
		} finally {
			isLoadingSources = false;
		}
	}

	async function getTargetSelection() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		isLoadingTargets = true;
		statusMessage = 'Fetching target selection...';
		statusType = 'info';

		try {
			targetObjects = await wwise.getSelectedObjects();
			statusMessage = `Got ${targetObjects.length} target object(s)`;
			statusType = 'info';
		} catch (error) {
			statusMessage = error instanceof Error ? error.message : 'Failed to get selection';
			statusType = 'error';
		} finally {
			isLoadingTargets = false;
		}
	}

	function clearSources() {
		sourceObjects = [];
		statusMessage = '';
	}

	function clearTargets() {
		targetObjects = [];
		statusMessage = '';
	}

	async function executeCopy() {
		if (!canExecute) return;

		isExecuting = true;
		statusMessage = 'Copying objects...';
		statusType = 'info';

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

			statusMessage = `Copied ${sourceObjects.length} object(s) into ${targetObjects.length} target(s) (${copiedCount} total)`;
			statusType = 'success';
		} catch (error) {
			await wwise.cancelUndoGroup();
			statusMessage = error instanceof Error ? error.message : 'Copy operation failed';
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
			Copy selected objects into one or more target containers. First capture the sources, then
			select targets in Wwise.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button
				onclick={executeCopy}
				disabled={!canExecute}
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			>
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
						<button
							onclick={clearSources}
							class="text-xs text-red-500 font-medium px-3 py-1.5 rounded-md bg-red-500/10 flex gap-1.5 transition-colors items-center hover:bg-red-500/20"
						>
							<Trash2 size={14} />
							Clear
						</button>
					{/if}
					<button
						onclick={getSourceSelection}
						disabled={!wwise.isConnected || isLoadingSources}
						class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
						<button
							onclick={clearTargets}
							class="text-xs text-red-500 font-medium px-3 py-1.5 rounded-md bg-red-500/10 flex gap-1.5 transition-colors items-center hover:bg-red-500/20"
						>
							<Trash2 size={14} />
							Clear
						</button>
					{/if}
					<button
						onclick={getTargetSelection}
						disabled={!wwise.isConnected || isLoadingTargets}
						class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed"
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
				<Select
					id="conflict-select"
					items={conflictItems}
					bind:value={onNameConflict}
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
							<div class="flex gap-2 items-center mb-2">
								<Badge variant="wwise">{getTypeDisplayName(target.type)}</Badge>
								<span class="text-sm text-base font-medium font-mono">{target.name}</span>
								<span class="text-xs text-muted ml-auto">
									receives {sourceObjects.length} object{sourceObjects.length !== 1 ? 's' : ''}
								</span>
							</div>
							<div class="ml-6 space-y-1">
								{#each sourceObjects as source (source.id)}
									<div class="flex gap-2 items-center">
										<span class="text-wwise text-xs">+</span>
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
