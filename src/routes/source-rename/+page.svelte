<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { RefreshCw, FileHeadphone, ClipboardPaste, Copy, FolderOpen } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge, { getTypeDisplayName } from '$lib/components/badge.svelte';

	// Audio source object with file path info
	interface AudioSource {
		id: string;
		name: string;
		type: string;
		path: string;
		originalFilePath: string;
		fileName: string; // Just the filename without path
		directory: string; // The directory path
	}

	// State
	let selectedObjects = $state<WwiseObject[]>([]);
	let audioSources = $state<AudioSource[]>([]);
	let namesText = $state('');
	let isLoading = $state(false);
	let isExecuting = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');

	// Derive clipboardNames from the text
	const clipboardNames = $derived(namesText.split('\n'));

	// Preview mapping: object id -> new filename
	const previewMapping = $derived.by(() => {
		const mapping = new SvelteMap<string, string>();
		const count = Math.min(audioSources.length, clipboardNames.length);
		for (let i = 0; i < count; i++) {
			const source = audioSources[i];
			let newName = clipboardNames[i].trim();

			// Ensure the new name has the same extension
			if (newName && !newName.toLowerCase().endsWith('.wav')) {
				// Get original extension
				const ext = source.fileName.substring(source.fileName.lastIndexOf('.'));
				newName = newName + ext;
			}

			if (newName && newName !== source.fileName) {
				mapping.set(source.id, newName);
			}
		}
		return mapping;
	});

	// Objects that will be renamed
	const sourcesToRename = $derived(audioSources.filter((obj) => previewMapping.has(obj.id)));

	// Objects that won't be renamed (no matching line or same name)
	const skippedSources = $derived(audioSources.filter((obj) => !previewMapping.has(obj.id)));

	// Extract filename from full path
	function extractFileName(filePath: string): string {
		const separator = filePath.includes('\\') ? '\\' : '/';
		const parts = filePath.split(separator);
		return parts[parts.length - 1];
	}

	// Extract directory from full path
	function extractDirectory(filePath: string): string {
		const separator = filePath.includes('\\') ? '\\' : '/';
		const parts = filePath.split(separator);
		parts.pop();
		return parts.join(separator);
	}

	async function refreshSelection() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		isLoading = true;
		statusMessage = 'Fetching selection and audio sources...';
		statusType = 'info';

		try {
			selectedObjects = await wwise.getSelectedObjects();

			if (selectedObjects.length === 0) {
				statusMessage = 'No objects selected';
				statusType = 'info';
				audioSources = [];
				return;
			}

			// Get audio sources for selected objects
			const objectIds = selectedObjects.map((obj) => obj.id);
			const sources = await wwise.getAudioSources(objectIds);

			audioSources = sources.map((src) => ({
				...src,
				fileName: extractFileName(src.originalFilePath),
				directory: extractDirectory(src.originalFilePath)
			}));

			if (audioSources.length === 0) {
				statusMessage = `${selectedObjects.length} object(s) selected, but none have audio sources`;
				statusType = 'info';
			} else {
				statusMessage = `Found ${audioSources.length} audio source(s) from ${selectedObjects.length} selected object(s)`;
				statusType = 'info';
			}
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
		} catch {
			statusMessage = 'Failed to read clipboard. Please allow clipboard access.';
			statusType = 'error';
		}
	}

	function pasteFromSources() {
		if (audioSources.length === 0) {
			statusMessage = 'No audio sources found. Get selection first.';
			statusType = 'error';
			return;
		}
		// Use filenames without extension for easier editing
		namesText = audioSources.map((src) => src.fileName.replace(/\.[^.]+$/, '')).join('\n');
		statusMessage = `Populated ${audioSources.length} filename(s) from sources`;
		statusType = 'info';
	}

	function pasteFromObjectNames() {
		if (audioSources.length === 0) {
			statusMessage = 'No audio sources found. Get selection first.';
			statusType = 'error';
			return;
		}
		// Use Wwise object names
		namesText = audioSources.map((src) => src.name).join('\n');
		statusMessage = `Populated ${audioSources.length} name(s) from Wwise objects`;
		statusType = 'info';
	}

	async function executeRename() {
		if (!wwise.isConnected) {
			statusMessage = 'Not connected to Wwise';
			statusType = 'error';
			return;
		}

		if (sourcesToRename.length === 0) {
			statusMessage = 'No audio files to rename';
			statusType = 'error';
			return;
		}

		isExecuting = true;
		statusMessage = 'Renaming audio source files...';
		statusType = 'info';

		try {
			await wwise.beginUndoGroup();

			let renamedCount = 0;

			for (const source of sourcesToRename) {
				const newFileName = previewMapping.get(source.id);
				if (newFileName) {
					// Build the new full path
					const separator = source.originalFilePath.includes('\\') ? '\\' : '/';
					const newFilePath = source.directory + separator + newFileName;

					await wwise.setAudioSourceOriginalFilePath(source.id, newFilePath);
					renamedCount++;
				}
			}

			await wwise.endUndoGroup('Rename Audio Sources');

			statusMessage = `Updated ${renamedCount} audio source path(s) in Wwise. Note: You may need to manually rename the actual files on disk.`;
			statusType = 'success';

			// Clear state after success
			selectedObjects = [];
			audioSources = [];
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
			Rename source audio files of selected Sound objects. Updates the original file path reference
			in Wwise.
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
				disabled={!wwise.isConnected || sourcesToRename.length === 0 || isExecuting}
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
			>
				<FileHeadphone size={16} />
				{isExecuting ? 'Renaming...' : 'Rename Sources'}
			</button>
		</div>
	</div>

	<!-- Clipboard Input -->
	<div class="p-5 border border-base rounded-xl bg-base space-y-4">
		<div class="flex items-center justify-between">
			<span class="text-[10px] text-muted tracking-wider font-medium uppercase">
				New Filenames
			</span>
			<div class="flex flex-wrap gap-2 justify-end">
				<button
					onclick={pasteFromSources}
					disabled={audioSources.length === 0}
					class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<FolderOpen size={14} />
					From File Names
				</button>
				<button
					onclick={pasteFromObjectNames}
					disabled={audioSources.length === 0}
					class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<Copy size={14} />
					From Object Names
				</button>
				<button
					onclick={pasteFromClipboard}
					class="text-xs text-wwise font-medium px-3 py-1.5 rounded-md bg-wwise/10 flex gap-1.5 transition-colors items-center hover:bg-wwise/20"
				>
					<ClipboardPaste size={14} />
					From Clipboard
				</button>
			</div>
		</div>
		<textarea
			bind:value={namesText}
			placeholder="Enter new filenames here, one per line (extension optional)..."
			spellcheck="false"
			rows={6}
			class="text-sm text-base font-mono px-3 py-2 border border-base rounded-lg bg-surface-50 w-full resize-y transition-colors focus:outline-none focus:border-wwise dark:bg-surface-800 focus:ring-1 focus:ring-wwise/20"
		></textarea>
		<p class="text-xs text-muted m-0">
			{clipboardNames.filter((n) => n.trim()).length} filename(s) parsed • .wav extension will be added
			automatically if missing
		</p>
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

	<!-- Skipped Sources Warning -->
	{#if skippedSources.length > 0 && audioSources.length > 0 && clipboardNames.length > 0}
		<Alert variant="warning">
			<p class="font-medium m-0">{skippedSources.length} source(s) will be skipped</p>
			<p class="text-xs m-0 mt-1 opacity-80">
				{#if skippedSources.length > clipboardNames.length}
					Not enough names for all audio sources
				{:else}
					Names are the same or empty
				{/if}
			</p>
		</Alert>
	{/if}

	<!-- Preview -->
	{#if audioSources.length > 0}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Preview</h3>
				<span class="text-xs text-muted">
					{sourcesToRename.length} of {audioSources.length} source{audioSources.length !== 1
						? 's'
						: ''} will be renamed
				</span>
			</div>
			<div class="border border-base rounded-lg bg-base overflow-hidden">
				<div class="max-h-96 overflow-y-auto">
					{#each audioSources as source, i (source.id)}
						{@const newFileName = previewMapping.get(source.id)}
						{@const willRename = !!newFileName}
						<div
							class="px-4 py-3 border-b border-base flex flex-col gap-2 last:border-b-0 {willRename
								? ''
								: 'opacity-40'}"
						>
							<div class="flex gap-4 items-center">
								<span class="text-xs text-muted shrink-0 w-6">{i + 1}</span>
								<Badge variant="wwise">{getTypeDisplayName(source.type)}</Badge>
								<span class="text-sm text-muted font-medium truncate">{source.name}</span>
							</div>
							<div class="pl-10 flex gap-4 items-center">
								<div class="flex flex-1 gap-3 min-w-0 items-center">
									<span
										class="text-xs text-muted font-mono truncate"
										title={source.originalFilePath}>{source.fileName}</span
									>
									{#if willRename}
										<span class="text-wwise shrink-0">→</span>
										<span class="text-sm text-wwise font-medium font-mono truncate"
											>{newFileName}</span
										>
									{:else}
										<span class="text-xs text-muted italic">
											{clipboardNames[i]?.trim() ? '(unchanged)' : '(no name)'}
										</span>
									{/if}
								</div>
							</div>
							{#if source.directory}
								<div class="pl-10">
									<span
										class="text-muted/70 text-[10px] font-mono block truncate"
										title={source.directory}
									>
										📁 {source.directory}
									</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Info Notice -->
	<Alert variant="info">
		<p class="font-medium m-0">How this works</p>
		<p class="text-xs m-0 mt-1 opacity-80">
			This tool updates the "Original" file path reference in Wwise. The actual audio files on disk
			are not automatically renamed. After updating paths in Wwise, you may need to rename the files
			manually or use a file renaming tool to match.
		</p>
	</Alert>

	<!-- Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}
</div>
