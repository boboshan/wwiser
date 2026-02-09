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

		// Get the slider state for a given volume property
		getSlider(property: VolumeProperty): SliderState | undefined {
			switch (property) {
				case 'Volume':
					return this.category === 'bus' ? this.voiceVolumeState : this.volumeState;
				case 'BusVolume':
					return this.busVolumeState;
				case 'OutputBusVolume':
					return this.outputBusVolumeState;
			}
		}
	}
</script>

<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import { wwise, type WwiseObject } from '$lib/wwise/connection.svelte';
	import { Volume2 } from 'lucide-svelte';
	import Alert from '$lib/components/alert.svelte';
	import VolumeGraph from './volume-graph.svelte';

	// Types
	interface VolumeInfo {
		object: WwiseObject;
		contributions: VolumeContribution[];
		/** ID of the contribution node that routes into the bus chain */
		routingSourceId?: string;
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

			// Confirm the committed slider value
			contrib.getSlider(property)?.confirm();

			// Sync other contribution instances sharing the same Wwise object
			for (const item of volumeData) {
				for (const c of item.contributions) {
					if (c !== contrib && c.id === contrib.id) {
						const slider = c.getSlider(property);
						if (slider) {
							slider.value = newValue;
							slider.confirm();
						}
					}
				}
			}

			// Invalidate cache
			objectCache.delete(contrib.id);
		} catch (e) {
			await wwise.cancelUndoGroup();
			// Revert slider to its last confirmed value
			contrib.getSlider(property)?.revert();
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
		routingSourceId: string;
	}> {
		const contributions: VolumeContribution[] = [];
		let currentId = objectId;
		let effectiveOutputBus: { id: string; name: string } | null = null;
		let foundOutputBusOverride = false;
		let routingSourceId = objectId; // default: self routes to bus

		// First, get self to check its output bus override
		const selfObj = await getCachedObjectDetails(objectId);
		if (selfObj?.overrideOutput && selfObj.outputBus?.id) {
			effectiveOutputBus = selfObj.outputBus;
			foundOutputBusOverride = true;
			routingSourceId = objectId;
		}

		while (true) {
			const obj = await getCachedObjectDetails(currentId);
			if (!obj?.parent?.id) break;

			const parent = await getCachedObjectDetails(obj.parent.id);
			if (!parent) break;
			if (parent.type === 'Project' || parent.type === 'WorkUnit') break;

				// Does this ancestor route to a specific output bus?
			// Check both @OverrideOutput and non-Master @OutputBus (root-level
			// containers may have @OverrideOutput=false even with an explicit bus).
			const hasOutputBus =
				parent.outputBus?.id != null &&
				(parent.overrideOutput || parent.outputBus.name !== 'Master Audio Bus');

			if (!foundOutputBusOverride && hasOutputBus) {
				effectiveOutputBus = parent.outputBus!;
				foundOutputBusOverride = true;
				routingSourceId = parent.id;
			}

			contributions.push(
				new VolumeContribution({
					id: parent.id,
					name: parent.name,
					type: parent.type,
					category: 'ancestor',
					volume: parent.volume,
					outputBusVolume: hasOutputBus ? parent.outputBusVolume : undefined,
					outputBusName: hasOutputBus ? `→ ${parent.outputBus!.name}` : undefined
				})
			);

			currentId = parent.id;
		}

		// If no override found, get the default output bus from the original object
		if (!foundOutputBusOverride && selfObj?.outputBus?.id) {
			effectiveOutputBus = selfObj.outputBus;
		}

		// If no override found, routing comes from the last ancestor (or self if none)
		if (!foundOutputBusOverride && contributions.length > 0) {
			routingSourceId = contributions[contributions.length - 1].id;
		}

		return { contributions, effectiveOutputBus, routingSourceId };
	}

	// Get bus chain contributions starting from a bus (includes the bus and all its ancestors up to Master)
	async function getBusChainContributions(busId: string): Promise<VolumeContribution[]> {
		const contributions: VolumeContribution[] = [];
		let currentBusId: string | undefined = busId;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to async function, not reactive state
		const visited = new Set<string>();

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
						contributions.push(
							new VolumeContribution({
								id: selfData.id,
								name: selfData.name,
								type: selfData.type,
								category: 'self',
								volume: selfData.volume,
								outputBusVolume: selfData.overrideOutput ? selfData.outputBusVolume : undefined,
								outputBusName:
									selfData.overrideOutput && selfData.outputBus
										? `→ ${selfData.outputBus.name}`
										: undefined
							})
						);

						// Get ancestor contributions and find effective output bus
						const {
							contributions: ancestorContribs,
							effectiveOutputBus,
							routingSourceId
						} = await getHierarchyContributions(obj.id);
						contributions.push(...ancestorContribs);

						// Get output bus chain contributions using the effective output bus
						if (effectiveOutputBus?.id) {
							const busContribs = await getBusChainContributions(effectiveOutputBus.id);
							contributions.push(...busContribs);
						}

						results.push({
							object: obj,
							contributions,
							routingSourceId
						});
					}
				}

				if (!results.find((r) => r.object.id === obj.id)) {
					results.push({
						object: obj,
						contributions
					});
				}
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

</script>

<div class="flex flex-col gap-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<p class="text-sm text-muted leading-relaxed m-0">
			Calculate the effective output volume of selected objects, including hierarchy and bus chain
			contributions.
		</p>
		<div class="flex shrink-0 gap-3 items-center">
			<button
				class="text-sm text-white font-medium px-5 rounded-lg bg-wwise flex flex-1 gap-2 h-10 transition-colors items-center justify-center hover:bg-wwise-400 disabled:opacity-50 sm:flex-none disabled:cursor-not-allowed"
				onclick={calculate}
				disabled={!wwise.isConnected || isLoading}
			>
				<Volume2 size={16} class={isLoading ? 'animate-pulse' : ''} />
				{isLoading ? 'Calculating...' : 'Calculate Selection'}
			</button>
		</div>
	</div>

	<!-- Connection Warning -->
	{#if !wwise.isConnected}
		<Alert variant="warning">Connect to Wwise to use this tool</Alert>
	{/if}

	<!-- Results -->
	{#if volumeData.length > 0}
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h3 class="text-[10px] text-muted tracking-wider font-medium m-0 uppercase">Results</h3>
				<span class="text-xs text-muted"
					>{volumeData.length} object{volumeData.length !== 1 ? 's' : ''}</span
				>
			</div>
			<VolumeGraph {volumeData} {isSaving} onVolumeChange={handleVolumeChange} />
		</section>
	{/if}

	<!-- Status Message -->
	{#if statusMessage && volumeData.length === 0}
		<Alert variant={statusType}>
			{statusMessage}
		</Alert>
	{/if}
</div>
