<script lang="ts">
	import { untrack } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { watchUndoRedo } from '$lib/state/undo-watcher.svelte';
	import { RefreshCw, Pencil, ClipboardPaste, Copy } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';
	import { toaster } from '$lib/components/toast.svelte';

	// State
	let selectedObjects = $state<WwiseObject[]>([]);
	let namesText = $state('');
	let isLoading = $state(false);
	let isExecuting = $state(false);

	// ── Undo/redo refresh ───────────────────────────────────────────────

	async function refreshObjects() {
		const current = untrack(() => selectedObjects);
		if (current.length === 0 || !wwise.isConnected) return;
		try {
			const refreshed = await wwise.getObjects({ id: current.map((o) => o.id) }, [
				'id',
				'name',
				'type',
				'path'
			]);
			const byId = new Map(refreshed.map((o) => [o.id, o]));
			selectedObjects = current.map((o) => byId.get(o.id) ?? o);
		} catch {
			// Refresh failed — stale data is acceptable
		}
	}

	watchUndoRedo(() => selectedObjects.length > 0, refreshObjects);

	// Derive clipboardNames from the text
	const clipboardNames = $derived(namesText.split('\n'));

	// Preview mapping: object id -> new name
	const previewMapping = $derived.by(() => {
		const mapping = new SvelteMap<string, string>();
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
	const objectsToRename = $derived(selectedObjects.filter((obj) => previewMapping.has(obj.id)));

	// Objects that won't be renamed (no matching line or same name)
	const skippedObjects = $derived(selectedObjects.filter((obj) => !previewMapping.has(obj.id)));

	async function refreshSelection() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}

		isLoading = true;

		try {
			selectedObjects = await wwise.getSelectedObjects();
			toaster.create({ title: `Found ${selectedObjects.length} selected object(s)`, type: 'info' });
		} catch (error) {
			toaster.create({
				title: error instanceof Error ? error.message : 'Failed to get selection',
				type: 'error'
			});
		} finally {
			isLoading = false;
		}
	}

	async function pasteFromClipboard() {
		try {
			const text = await navigator.clipboard.readText();
			namesText = text;
			const count = text.split('\n').filter((line) => line.trim()).length;
			toaster.create({ title: `Parsed ${count} name(s) from clipboard`, type: 'info' });
		} catch {
			toaster.create({
				title: 'Failed to read clipboard. Please allow clipboard access.',
				type: 'error'
			});
		}
	}

	function pasteFromSelection() {
		if (selectedObjects.length === 0) {
			toaster.create({ title: 'No objects selected. Get selection first.', type: 'error' });
			return;
		}
		namesText = selectedObjects.map((obj) => obj.name).join('\n');
		toaster.create({
			title: `Populated ${selectedObjects.length} name(s) from selection`,
			type: 'info'
		});
	}

	async function executeRename() {
		if (!wwise.isConnected) {
			toaster.create({ title: 'Not connected to Wwise', type: 'error' });
			return;
		}

		if (objectsToRename.length === 0) {
			toaster.create({ title: 'No objects to rename', type: 'error' });
			return;
		}

		isExecuting = true;

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

			toaster.create({ title: `Renamed ${renamedCount} object(s)`, type: 'success' });

			// Clear state after success
			selectedObjects = [];
			namesText = '';
		} catch (error) {
			await wwise.cancelUndoGroup();
			toaster.create({
				title: error instanceof Error ? error.message : 'Rename operation failed',
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
			Rename selected objects using names from clipboard. Each line in the clipboard corresponds to
			an object in selection order.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button
				onclick={refreshSelection}
				disabled={!wwise.isConnected || isLoading}
				class="btn-secondary flex-1 sm:flex-none"
			>
				<RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
				{isLoading ? 'Loading...' : 'Get Selection'}
			</button>
			<button
				onclick={executeRename}
				disabled={!wwise.isConnected || objectsToRename.length === 0 || isExecuting}
				class="btn-action flex-1 sm:flex-none"
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
					class="btn-accent-sm"
				>
					<Copy size={14} />
					Paste from Selection
				</button>
				<button onclick={pasteFromClipboard} class="btn-accent-sm">
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
			class="input-base text-base font-mono px-3 py-2 resize-y"
		></textarea>
		<p class="text-xs text-muted m-0">
			{clipboardNames.filter((n) => n.trim()).length} name(s) parsed
		</p>
	</div>

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
							class="px-4 py-3 border-b border-base flex gap-4 items-center last:border-b-0 {willRename
								? ''
								: 'opacity-40'}"
						>
							<span class="text-xs text-muted shrink-0 w-6">{i + 1}</span>
							<Badge variant="wwise">{getTypeDisplayName(obj.type)}</Badge>
							<div class="flex flex-1 gap-3 min-w-0 items-center">
								<span class="text-sm text-base font-mono truncate">{obj.name}</span>
								{#if willRename}
									<span class="text-wwise shrink-0">→</span>
									<span class="text-sm text-wwise font-medium font-mono truncate">{newName}</span>
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
