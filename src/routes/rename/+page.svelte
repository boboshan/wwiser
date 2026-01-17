<script lang="ts">
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { RefreshCw, Pencil, ClipboardPaste, Copy } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';

	// State
	let selectedObjects = $state<WwiseObject[]>([]);
	let namesText = $state('');
	let isLoading = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');

	// Derive clipboardNames from the text
	const clipboardNames = $derived(namesText.split('\n'));

	// Preview mapping: object id -> new name
	const previewMapping = $derived.by(() => {
		const mapping = new Map<string, string>();
		const count = Math.min(selectedObjects.length, clipboardNames.length);
		for (let i = 0; i < count; i++) {
			const obj = selectedObjects[i];
			const newName = clipboardNames[i].trim();
			if (newName && newName !== obj.name) {
				mapping.set(obj.id, newName);
			}
		}
		return mapping;
	});

	// Objects that will be renamed
	const objectsToRename = $derived(
		selectedObjects.filter((obj) => previewMapping.has(obj.id))
	);

	// Objects that won't be renamed (no matching line or same name)
	const skippedObjects = $derived(
		selectedObjects.filter((obj) => !previewMapping.has(obj.id))
	);

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

	async function pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			namesText = text;
			const count = text.split('\n').filter((line) => line.trim()).length;
			statusMessage = `Parsed ${count} name(s) from clipboard`;
			statusType = 'info';
		} catch (error) {
			statusMessage = 'Failed to read clipboard. Please allow clipboard access.';
			statusType = 'error';
		}
	}

	function pasteFromSelection() {
		if (selectedObjects.length === 0) {
			statusMessage = 'No objects selected. Get selection first.';
			statusType = 'error';
			return;
		}
		namesText = selectedObjects.map((obj) => obj.name).join('\n');
		statusMessage = `Populated ${selectedObjects.length} name(s) from selection`;
		statusType = 'info';
	}

	async function executeRename() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		if (objectsToRename.length === 0) {
			statusMessage = 'No objects to rename';
			statusType = 'error';
			return;
		}

		isExecuting = true;
		statusMessage = 'Renaming objects...';
		statusType = 'info';

		try {
			await wwise.beginUndoGroup();

			let renamedCount = 0;

			for (const obj of objectsToRename) {
				const newName = previewMapping.get(obj.id);
				if (newName) {
					await wwise.renameObject(obj.id, newName);
					renamedCount++;
				}
			}

			await wwise.endUndoGroup('Rename Objects');

			statusMessage = `Renamed ${renamedCount} object(s)`;
			statusType = 'success';

			// Clear state after success
			selectedObjects = [];
			namesText = '';
		} catch (error) {
			await wwise.cancelUndoGroup();
			statusMessage = error instanceof Error ? error.message : 'Rename operation failed';
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
			Rename selected objects using names from clipboard. Each line in the clipboard corresponds to
			an object in selection order.
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
				onclick={executeRename}
				disabled={!wwise.isConnected || objectsToRename.length === 0 || isExecuting}
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			>
				<Pencil size={16} />
				{isExecuting ? 'Renaming...' : 'Rename Objects'}
			</button>
		</div>
	</div>

	<!-- Clipboard Input -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-4">
		<div class="flex items-center justify-between">
			<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
				New Names (from Clipboard)
			</span>
			<div class="flex gap-2">
				<button
					onclick={pasteFromSelection}
					disabled={selectedObjects.length === 0}
					class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Copy size={14} />
					Paste from Selection
				</button>
				<button
					onclick={pasteFromClipboard}
					class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20"
				>
					<ClipboardPaste size={14} />
					Paste from Clipboard
				</button>
			</div>
		</div>
		<textarea
			bind:value={namesText}
			placeholder="Paste new names here, one per line..."
			spellcheck="false"
			rows={6}
			class="text-sm text-base font-mono px-3 py-2 border border-base rounded-lg bg-surface-50 w-full transition-colors resize-y focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
		></textarea>
		<p class="text-xs text-muted m-0">
			{clipboardNames.filter((n) => n.trim()).length} name(s) parsed
		</p>
	</div>

	<!-- Status -->
	{#if statusMessage}
		<div
			class="text-sm px-4 py-3 rounded-lg flex gap-2 items-center {statusType === 'success'
				? 'text-green-600 border border-green-500/20 bg-green-500/10 dark:text-green-400'
				: statusType === 'error'
					? 'text-red-600 border border-red-500/20 bg-red-500/10 dark:text-red-400'
					: 'text-wwise border border-wwise/20 bg-wwise/10'}"
		>
			{statusMessage}
		</div>
	{/if}

	<!-- Skipped Objects Warning -->
	{#if skippedObjects.length > 0 && selectedObjects.length > 0 && clipboardNames.length > 0}
		<Alert variant="warning">
			<p class="font-medium m-0">{skippedObjects.length} object(s) will be skipped</p>
			<p class="text-xs m-0 mt-1 opacity-80">
				{#if skippedObjects.length > clipboardNames.length}
					Not enough names in clipboard for all selected objects
				{:else}
					Names are the same or empty
				{/if}
			</p>
		</Alert>
	{/if}

	<!-- Preview -->
	{#if selectedObjects.length > 0}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted">
					{objectsToRename.length} of {selectedObjects.length} object{selectedObjects.length !== 1
						? 's'
						: ''} will be renamed
				</span>
			</div>
			<div class="border border-base rounded-lg bg-base overflow-hidden">
				<div class="max-h-96 overflow-y-auto">
					{#each selectedObjects as obj, i (obj.id)}
						{@const newName = previewMapping.get(obj.id)}
						{@const willRename = !!newName}
						<div
							class="px-4 py-3 border-b border-base last:border-b-0 flex items-center gap-4 {willRename
								? ''
								: 'opacity-40'}"
						>
							<span class="text-xs text-muted w-6 shrink-0">{i + 1}</span>
							<Badge>{getTypeDisplayName(obj.type)}</Badge>
							<div class="flex-1 min-w-0 flex items-center gap-3">
								<span class="text-sm text-base font-mono truncate">{obj.name}</span>
								{#if willRename}
									<span class="text-wwise shrink-0">→</span>
									<span class="text-sm text-wwise font-mono font-medium truncate">{newName}</span>
								{:else}
									<span class="text-xs text-muted italic">
										{clipboardNames[i]?.trim() ? '(unchanged)' : '(no name)'}
									</span>
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
