<script lang="ts" module>
	// Type name formatting - converts PascalCase Wwise types to readable names
	export const TYPE_DISPLAY_NAMES: Record<string, string> = {
		ActorMixer: 'Actor-Mixer',
		BlendContainer: 'Blend Container',
		RandomSequenceContainer: 'Random Sequence',
		SwitchContainer: 'Switch Container',
		AuxBus: 'Aux Bus',
		WorkUnit: 'Work Unit',
		SoundBank: 'Sound Bank',
		GameParameter: 'Game Parameter',
		StateGroup: 'State Group',
		SwitchGroup: 'Switch Group',
		AudioDevice: 'Audio Device',
		ControlSurfaceBinding: 'Control Surface Binding',
		ControlSurfaceSession: 'Control Surface Session',
		ModulatorLfo: 'Modulator LFO',
		ModulatorEnvelope: 'Modulator Envelope',
		ModulatorTime: 'Modulator Time'
	};

	export function getTypeDisplayName(type: string): string {
		return TYPE_DISPLAY_NAMES[type] ?? type;
	}

	export type BadgeVariant = 'default' | 'wwise' | 'purple' | 'blue' | 'green' | 'red';
</script>

<script lang="ts">
	interface Props {
		variant?: BadgeVariant;
		class?: string;
		children: import('svelte').Snippet;
	}

	let { variant = 'default', class: className = '', children }: Props = $props();

	const variantClasses: Record<BadgeVariant, string> = {
		default: 'text-muted bg-surface-200 dark:bg-surface-700',
		wwise: 'text-wwise bg-wwise/10',
		purple: 'text-purple-600 bg-purple-500/10 dark:text-purple-400',
		blue: 'text-blue-600 bg-blue-500/10 dark:text-blue-400',
		green: 'text-green-600 bg-green-500/10 dark:text-green-400',
		red: 'text-red-600 bg-red-500/10 dark:text-red-400'
	};
</script>

<span
	class="text-xs font-medium px-2 py-0.5 rounded-full shrink-0 {variantClasses[variant]} {className}"
>
	{@render children()}
</span>
