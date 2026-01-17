<script lang="ts" module>
	import { SliderState } from './volume-slider.svelte';
	import { getTypeDisplayName } from '$lib/components/badge.svelte';

	// Volume property types
	type VolumeProperty = 'Volume' | 'BusVolume' | 'OutputBusVolume';

	// VolumeContribution class - encapsulates all volume state and logic
	export class VolumeContribution {
		readonly id: string;
		readonly name: string;
		readonly type: string;
		readonly outputBusName?: string;
		category: 'self' | 'ancestor' | 'bus';

		// Slider states (each manages its own reactive value)
		readonly volumeState: SliderState;
		readonly voiceVolumeState?: SliderState;
		readonly busVolumeState?: SliderState;
		readonly outputBusVolumeState?: SliderState;

		constructor(data: {
			id: string;
			name: string;
			type: string;
			category: 'self' | 'ancestor' | 'bus';
			volume: number;
			voiceVolume?: number;
			busVolume?: number;
			outputBusVolume?: number;
			outputBusName?: string;
		}) {
			this.id = data.id;
			this.name = data.name;
			this.type = data.type;
			this.category = data.category;
			this.outputBusName = data.outputBusName;

			this.volumeState = new SliderState(data.volume);
			this.voiceVolumeState =
				data.voiceVolume !== undefined ? new SliderState(data.voiceVolume) : undefined;
			this.busVolumeState =
				data.busVolume !== undefined ? new SliderState(data.busVolume) : undefined;
			this.outputBusVolumeState =
				data.outputBusVolume !== undefined ? new SliderState(data.outputBusVolume) : undefined;
		}

		// Get the total contribution of this item
		get total(): number {
			let sum = this.volumeState.value;
			if (this.voiceVolumeState) sum += this.voiceVolumeState.value;
			if (this.busVolumeState) sum += this.busVolumeState.value;
			if (this.outputBusVolumeState) sum += this.outputBusVolumeState.value;
			return sum;
		}

		// Get stored value for a property
		getValue(property: VolumeProperty): number {
			switch (property) {
				case 'Volume':
					return this.category === 'bus'
						? (this.voiceVolumeState?.value ?? 0)
						: this.volumeState.value;
				case 'BusVolume':
					return this.busVolumeState?.value ?? 0;
				case 'OutputBusVolume':
					return this.outputBusVolumeState?.value ?? 0;
			}
		}

		// Update value for a property, returns delta
		setValue(property: VolumeProperty, value: number): number {
			const oldValue = this.getValue(property);
			switch (property) {
				case 'Volume':
					if (this.category === 'bus' && this.voiceVolumeState) {
						this.voiceVolumeState.value = value;
					} else {
						this.volumeState.value = value;
					}
					break;
				case 'BusVolume':
					if (this.busVolumeState) this.busVolumeState.value = value;
					break;
				case 'OutputBusVolume':
					if (this.outputBusVolumeState) this.outputBusVolumeState.value = value;
					break;
			}
			return value - oldValue;
		}

		// Get formatted type name
		get typeName(): string {
			return getTypeDisplayName(this.type);
		}

		// Get badge variant for type
		get badgeVariant(): 'wwise' | 'blue' | 'purple' {
			if (this.category === 'self') return 'wwise';
			if (this.type === 'Bus' || this.type === 'AuxBus') return 'blue';
			return 'purple';
		}
	}
</script>

<script lang="ts">
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { Volume2, ChevronRight } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import Badge from '$lib/components/badge.svelte';
	import VolumeSlider from './volume-slider.svelte';

	// Types
	interface VolumeInfo {
		object: WwiseObject;
		effectiveVolume: number;
		contributions: VolumeContribution[];
	}

	// Supported object types for volume calculation
	const SUPPORTED_TYPES = new Set([
		'Sound',
		'RandomSequenceContainer',
		'SwitchContainer',
		'BlendContainer',
		'ActorMixer',
		'Bus',
		'AuxBus'
	]);

	// State
	let volumeData = $state<VolumeInfo[]>([]);
	let isLoading = $state(false);
	let statusMessage = $state('');
	let statusType = $state<'info' | 'success' | 'error'>('info');
	let expandedRows = new SvelteSet<string>();
	let isSaving = $state(false);

	// Cache for object details to reduce API calls
	const objectCache = new SvelteMap<string, Awaited<ReturnType<typeof getObjectDetails>>>();

	// Set a property on a Wwise object
	async function setObjectProperty(
		objectId: string,
		property: string,
		value: number
	): Promise<void> {
		await wwise.call('ak.wwise.core.object.setProperty', {
			object: objectId,
			property,
			value
		});
	}

	// Update volume via callback (called from slider)
	async function handleVolumeChange(
		contrib: VolumeContribution,
		property: VolumeProperty,
		newValue: number
	): Promise<void> {
		try {
			isSaving = true;
			await wwise.beginUndoGroup();
			await setObjectProperty(contrib.id, property, newValue);
			await wwise.endUndoGroup(`Adjust ${property} on ${contrib.name}`);

			// Update stored value and get delta
			const delta = contrib.setValue(property, newValue);

			// Update effective volume for affected items
			for (const item of volumeData) {
				if (item.contributions.some((c) => c.id === contrib.id)) {
					item.effectiveVolume += delta;
				}
			}

			// Invalidate cache
			objectCache.delete(contrib.id);
		} catch (e) {
			await wwise.cancelUndoGroup();
			statusMessage = e instanceof Error ? e.message : 'Failed to update volume';
			statusType = 'error';
		} finally {
			isSaving = false;
		}
	}

	// Get object with all volume properties
	async function getObjectDetails(objectId: string): Promise<{
		id: string;
		name: string;
		type: string;
		volume: number;
		busVolume: number;
		outputBusVolume: number;
		outputBus?: { id: string; name: string };
		overrideOutput: boolean;
		parent?: { id: string };
	} | null> {
		try {
			const result = await wwise.call<{
				return: Array<{
					id: string;
					name: string;
					type: string;
					'@Volume': number;
					'@BusVolume': number;
					'@OutputBusVolume': number;
					'@OutputBus'?: { id: string; name: string };
					'@OverrideOutput': boolean;
					parent?: { id: string };
				}>;
			}>(
				'ak.wwise.core.object.get',
				{ from: { id: [objectId] } },
				{
					return: [
						'id',
						'name',
						'type',
						'@Volume',
						'@BusVolume',
						'@OutputBusVolume',
						'@OutputBus',
						'@OverrideOutput',
						'parent'
					]
				}
			);
			const obj = result?.return?.[0];
			if (!obj) return null;
			return {
				id: obj.id,
				name: obj.name,
				type: obj.type,
				volume: obj['@Volume'] ?? 0,
				busVolume: obj['@BusVolume'] ?? 0,
				outputBusVolume: obj['@OutputBusVolume'] ?? 0,
				outputBus: obj['@OutputBus'],
				overrideOutput: obj['@OverrideOutput'] ?? false,
				parent: obj.parent
			};
		} catch {
			return null;
		}
	}

	// Get cached object details
	async function getCachedObjectDetails(objectId: string) {
		if (objectCache.has(objectId)) {
			return objectCache.get(objectId)!;
		}
		const result = await getObjectDetails(objectId);
		objectCache.set(objectId, result);
		return result;
	}

	// Get all ancestors in the actor-mixer hierarchy with their volumes and output bus info
	async function getHierarchyContributions(objectId: string): Promise<{
		contributions: VolumeContribution[];
		effectiveOutputBus: { id: string; name: string } | null;
	}> {
		const contributions: VolumeContribution[] = [];
		let currentId = objectId;
		let effectiveOutputBus: { id: string; name: string } | null = null;
		let foundOutputBusOverride = false;

		// First, get self to check its output bus
		const selfObj = await getCachedObjectDetails(objectId);
		// Check if self has override OR has a non-default bus (indicates override even if flag is wrong)
		const selfHasOverride =
			selfObj?.overrideOutput ||
			(selfObj?.outputBus?.name && selfObj.outputBus.name !== 'Master Audio Bus');
		if (selfHasOverride && selfObj?.outputBus?.id) {
			effectiveOutputBus = selfObj.outputBus;
			foundOutputBusOverride = true;
		}

		while (true) {
			const obj = await getCachedObjectDetails(currentId);
			if (!obj?.parent?.id) break;

			const parent = await getCachedObjectDetails(obj.parent.id);
			if (!parent) break;
			if (parent.type === 'Project' || parent.type === 'WorkUnit') break;

			// Check if this ancestor overrides output bus (and we haven't found one yet)
			// Consider it an override if: overrideOutput flag is true OR outputBus is not Master Audio Bus
			const parentHasOverride =
				parent.overrideOutput ||
				(parent.outputBus?.name && parent.outputBus.name !== 'Master Audio Bus');

			if (!foundOutputBusOverride && parentHasOverride && parent.outputBus?.id) {
				effectiveOutputBus = parent.outputBus;
				foundOutputBusOverride = true;
			}

			// Each ancestor contributes its Volume and OutputBusVolume (if it has override)
			contributions.push(
				new VolumeContribution({
					id: parent.id,
					name: parent.name,
					type: parent.type,
					category: 'ancestor',
					volume: parent.volume,
					outputBusVolume: parentHasOverride ? parent.outputBusVolume : undefined,
					outputBusName:
						parentHasOverride && parent.outputBus ? `→ ${parent.outputBus.name}` : undefined
				})
			);

			currentId = parent.id;
		}

		// If no override found, get the default output bus from the original object
		if (!foundOutputBusOverride && selfObj?.outputBus?.id) {
			effectiveOutputBus = selfObj.outputBus;
		}

		return { contributions, effectiveOutputBus };
	}

	// Get bus chain contributions starting from a bus (includes the bus and all its ancestors up to Master)
	async function getBusChainContributions(busId: string): Promise<VolumeContribution[]> {
		const contributions: VolumeContribution[] = [];
		let currentBusId: string | undefined = busId;
		const visited = new SvelteSet<string>();

		while (currentBusId && !visited.has(currentBusId)) {
			visited.add(currentBusId);
			const bus = await getCachedObjectDetails(currentBusId);
			if (!bus) break;

			// Master Audio Bus is detected by name
			const isMasterBus = bus.name === 'Master Audio Bus';

			// Get parent bus for display (buses use parent hierarchy, not @OutputBus)
			let parentBusName: string | undefined;
			if (bus.parent?.id && !isMasterBus) {
				const parentBus = await getCachedObjectDetails(bus.parent.id);
				if (parentBus && (parentBus.type === 'Bus' || parentBus.type === 'AuxBus')) {
					parentBusName = parentBus.name;
				}
			}

			contributions.push(
				new VolumeContribution({
					id: bus.id,
					name: bus.name,
					type: bus.type,
					category: 'bus',
					volume: 0,
					voiceVolume: bus.volume, // Voice Volume is @Volume on buses
					busVolume: bus.busVolume,
					outputBusVolume: isMasterBus ? undefined : bus.outputBusVolume, // Master bus has no output bus volume
					outputBusName: parentBusName ? `→ ${parentBusName}` : undefined
				})
			);

			// Stop after Master Audio Bus
			if (isMasterBus) break;

			// Traverse via parent for buses (not @OutputBus)
			if (!bus.parent?.id) break;

			// Check if parent is a bus, otherwise stop
			const parentObj = await getCachedObjectDetails(bus.parent.id);
			if (!parentObj || (parentObj.type !== 'Bus' && parentObj.type !== 'AuxBus')) break;

			currentBusId = bus.parent.id;
		}

		return contributions;
	}

	// Calculate volumes for selection
	async function calculate() {
		if (!wwise.isConnected) return;

		isLoading = true;
		statusMessage = '';
		volumeData = [];
		objectCache.clear(); // Clear cache for fresh calculation

		try {
			const selectedObjects = await wwise.getSelectedObjects();

			if (selectedObjects.length === 0) {
				statusMessage = 'No objects selected in Wwise';
				statusType = 'info';
				isLoading = false;
				return;
			}

			// Filter to supported types only
			const supportedObjects = selectedObjects.filter((obj) => SUPPORTED_TYPES.has(obj.type));
			const skippedCount = selectedObjects.length - supportedObjects.length;

			if (supportedObjects.length === 0) {
				statusMessage = 'No supported objects selected (Sound, Containers, or Buses)';
				statusType = 'info';
				isLoading = false;
				return;
			}

			const results: VolumeInfo[] = [];

			for (const obj of supportedObjects) {
				const contributions: VolumeContribution[] = [];

				// Get self details
				const selfData = await getCachedObjectDetails(obj.id);
				if (selfData) {
					const isBusType = selfData.type === 'Bus' || selfData.type === 'AuxBus';

					if (isBusType) {
						// For buses: use getBusChainContributions starting from self
						const busContribs = await getBusChainContributions(selfData.id);
						// Mark the first one as 'self'
						if (busContribs.length > 0) {
							busContribs[0].category = 'self';
						}
						contributions.push(...busContribs);
					} else {
						// For non-bus objects: add self, then hierarchy, then bus chain
						const selfHasOverride =
							selfData.overrideOutput ||
							(selfData.outputBus?.name && selfData.outputBus.name !== 'Master Audio Bus');

						// Add self contribution
						contributions.push(
							new VolumeContribution({
								id: selfData.id,
								name: selfData.name,
								type: selfData.type,
								category: 'self',
								volume: selfData.volume,
								outputBusVolume: selfHasOverride ? selfData.outputBusVolume : undefined,
								outputBusName:
									selfHasOverride && selfData.outputBus ? `→ ${selfData.outputBus.name}` : undefined
							})
						);

						// Get ancestor contributions and find effective output bus
						const { contributions: ancestorContribs, effectiveOutputBus } =
							await getHierarchyContributions(obj.id);
						contributions.push(...ancestorContribs);

						// Get output bus chain contributions using the effective output bus
						if (effectiveOutputBus?.id) {
							const busContribs = await getBusChainContributions(effectiveOutputBus.id);
							contributions.push(...busContribs);
						}
					}
				}

				// Calculate effective volume using class getter
				const effectiveVolume = contributions.reduce((sum, c) => sum + c.total, 0);

				results.push({
					object: obj,
					effectiveVolume,
					contributions
				});
			}

			volumeData = results;
			const skippedText = skippedCount > 0 ? ` (${skippedCount} unsupported skipped)` : '';
			statusMessage = `Calculated volume for ${results.length} object${results.length !== 1 ? 's' : ''}${skippedText}`;
			statusType = 'success';
		} catch (e) {
			statusMessage = e instanceof Error ? e.message : 'Failed to calculate volumes';
			statusType = 'error';
		} finally {
			isLoading = false;
		}
	}

	// Toggle row expansion
	function toggleRow(id: string) {
		if (expandedRows.has(id)) {
			expandedRows.delete(id);
		} else {
			expandedRows.add(id);
		}
	}

	// Format volume with sign
	function formatVolume(vol: number): string {
		if (vol === 0) return '0 dB';
		return vol > 0 ? `+${vol.toFixed(1)} dB` : `${vol.toFixed(1)} dB`;
	}

	// Get volume color class
	function getVolumeColor(vol: number): string {
		if (vol > 0) return 'text-red-500';
		if (vol < -12) return 'text-blue-500';
		if (vol < 0) return 'text-green-500';
		return 'text-muted';
	}
</script>

<div class="flex flex-col gap-6">
	<!-- Description -->
	<p class="text-sm text-muted leading-relaxed m-0 max-w-lg">
		Calculate the final output volume including hierarchy and bus chain contributions.
	</p>

	<!-- Controls -->
	<div class="flex flex-wrap gap-3 items-center">
		<button
			class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex gap-2 h-10 transition-colors items-center hover:bg-wwise-400 disabled:opacity-50 disabled:cursor-not-allowed"
			onclick={calculate}
			disabled={!wwise.isConnected || isLoading}
		>
			<Volume2 size={16} class={isLoading ? 'animate-pulse' : ''} />
			{isLoading ? 'Calculating...' : 'Calculate Selection'}
		</button>
	</div>

	<!-- Connection Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}

	<!-- Results -->
	{#if volumeData.length > 0}
		<div class="space-y-2">
			{#each volumeData as item (item.object.id)}
				{@const hierarchyContribs = item.contributions.filter(
					(c) => c.category === 'self' || c.category === 'ancestor'
				)}
				{@const busContribs = item.contributions.filter((c) => c.category === 'bus')}
				{@const hierarchySum = hierarchyContribs.reduce((s, c) => s + c.total, 0)}
				{@const busSum = busContribs.reduce((s, c) => s + c.total, 0)}
				{@const isExpanded = expandedRows.has(item.object.id)}

				<div class="border border-base rounded-xl bg-base overflow-hidden">
					<!-- Main row -->
					<button
						class="px-4 py-3 text-left flex gap-3 w-full cursor-pointer transition-colors items-center hover:bg-surface-50 dark:hover:bg-surface-800/50"
						onclick={() => toggleRow(item.object.id)}
					>
						<ChevronRight
							size={14}
							class="text-muted shrink-0 transition-transform duration-150 {isExpanded
								? 'rotate-90'
								: ''}"
						/>
						<div class="flex flex-1 gap-2 min-w-0 items-center">
							<Badge variant="wwise">{getTypeDisplayName(item.object.type)}</Badge>
							<span class="text-sm text-base font-medium truncate">{item.object.name}</span>
						</div>
						<div class="text-xs flex shrink-0 gap-4 items-center">
							<div class="text-right">
								<div class="text-[10px] text-muted uppercase">Hierarchy</div>
								<div class="font-mono {getVolumeColor(hierarchySum)}">
									{formatVolume(hierarchySum)}
								</div>
							</div>
							<div class="text-right">
								<div class="text-[10px] text-muted uppercase">Bus</div>
								<div class="font-mono {getVolumeColor(busSum)}">{formatVolume(busSum)}</div>
							</div>
							<div class="text-right min-w-20">
								<div class="text-[10px] text-muted uppercase">Effective</div>
								<div class="font-mono font-semibold {getVolumeColor(item.effectiveVolume)}">
									{formatVolume(item.effectiveVolume)}
								</div>
							</div>
						</div>
					</button>

					<!-- Expanded details -->
					{#if isExpanded}
						<div class="px-4 pb-4 pt-1 space-y-4">
							<!-- Hierarchy contributions -->
							{#if hierarchyContribs.length > 0}
								<div>
									<div
										class="text-[10px] text-muted tracking-wider font-medium mb-2 ml-1 uppercase"
									>
										Actor-Mixer Hierarchy
									</div>
									<div class="pl-4 border-l-2 border-purple-500/30 space-y-3">
										{#each hierarchyContribs as contrib (contrib.id)}
											<div class="text-xs py-1.5 space-y-1.5">
												<div class="flex items-center justify-between">
													<div class="flex gap-2 items-center">
														<Badge variant={contrib.badgeVariant}>
															{contrib.typeName}
														</Badge>
														<span class="text-base">{contrib.name}</span>
														{#if contrib.outputBusName}
															<span class="text-[10px] text-blue-500">{contrib.outputBusName}</span>
														{/if}
													</div>
													<span class="font-medium font-mono {getVolumeColor(contrib.total)}">
														{formatVolume(contrib.total)}
													</span>
												</div>
												<VolumeSlider
													label="Voice"
													slider={contrib.volumeState}
													disabled={isSaving}
													oncommit={(v) => handleVolumeChange(contrib, 'Volume', v)}
												/>
												{#if contrib.outputBusVolumeState}
													<VolumeSlider
														label="OutBus"
														slider={contrib.outputBusVolumeState}
														disabled={isSaving}
														oncommit={(v) => handleVolumeChange(contrib, 'OutputBusVolume', v)}
													/>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Bus chain contributions -->
							{#if busContribs.length > 0}
								<div>
									<div
										class="text-[10px] text-muted tracking-wider font-medium mb-2 ml-1 uppercase"
									>
										Output Bus Chain
									</div>
									<div class="pl-4 border-l-2 border-blue-500/30 space-y-3">
										{#each busContribs as contrib (contrib.id)}
											<div class="text-xs py-1.5 space-y-1.5">
												<div class="flex items-center justify-between">
													<div class="flex gap-2 items-center">
														<Badge variant={contrib.badgeVariant}>
															{contrib.typeName}
														</Badge>
														<span class="text-base">{contrib.name}</span>
														{#if contrib.outputBusName}
															<span class="text-[10px] text-blue-500">{contrib.outputBusName}</span>
														{/if}
													</div>
													<span class="font-medium font-mono {getVolumeColor(contrib.total)}">
														{formatVolume(contrib.total)}
													</span>
												</div>
												<VolumeSlider
													label="Voice"
													slider={contrib.voiceVolumeState!}
													disabled={isSaving}
													oncommit={(v) => handleVolumeChange(contrib, 'Volume', v)}
												/>
												<VolumeSlider
													label="Bus"
													slider={contrib.busVolumeState!}
													disabled={isSaving}
													oncommit={(v) => handleVolumeChange(contrib, 'BusVolume', v)}
												/>
												{#if contrib.outputBusVolumeState}
													<VolumeSlider
														label="OutBus"
														slider={contrib.outputBusVolumeState}
														disabled={isSaving}
														oncommit={(v) => handleVolumeChange(contrib, 'OutputBusVolume', v)}
													/>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Status Message -->
	{#if statusMessage && volumeData.length === 0}
		<Alert variant={statusType}>
			{statusMessage}
		</Alert>
	{/if}
</div>
