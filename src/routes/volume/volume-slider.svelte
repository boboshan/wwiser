<script lang="ts" module>
	export class SliderState {
		value = $state(0);
		#lastCommitted: number | null = null;

		constructor(initial: number) {
			this.value = initial;
		}

		sync(propValue: number) {
			// Skip if we just committed this value
			if (this.#lastCommitted !== null && Math.abs(propValue - this.#lastCommitted) < 0.01) {
				return;
			}
			this.value = propValue;
			this.#lastCommitted = null;
		}

		commit(oncommit: (v: number) => void) {
			this.#lastCommitted = this.value;
			oncommit(this.value);
		}

		set(val: number, oncommit: (v: number) => void) {
			val = Math.max(-96, Math.min(12, val));
			this.value = val;
			this.#lastCommitted = val;
			oncommit(val);
		}
	}
</script>

<script lang="ts">
	interface Props {
		label: string;
		slider: SliderState;
		disabled?: boolean;
		oncommit: (value: number) => void;
	}

	let { label, slider, disabled = false, oncommit }: Props = $props();

	function getVolumeColor(vol: number): string {
		if (vol > 0) return 'text-red-500';
		if (vol < -12) return 'text-muted';
		return 'text-base';
	}

	function handleNumberCommit(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		let val = parseFloat(input.value);
		if (isNaN(val)) val = 0;
		slider.set(val, oncommit);
	}
</script>

<div class="ml-1 flex gap-2 items-center">
	<span class="text-[10px] text-muted w-9">{label}</span>
	<input
		type="range"
		min="-96"
		max="12"
		step="0.1"
		bind:value={slider.value}
		onchange={() => slider.commit(oncommit)}
		{disabled}
		class="accent-wwise h-1 w-24 cursor-pointer disabled:opacity-50"
	/>
	<input
		type="number"
		min="-96"
		max="12"
		step="0.1"
		value={slider.value.toFixed(1)}
		onchange={handleNumberCommit}
		{disabled}
		class="text-[11px] font-mono px-1.5 py-0.5 text-right outline-none rounded border-none bg-surface-200 w-14 dark:bg-surface-800 focus:ring-1 focus:ring-wwise/50 {getVolumeColor(
			slider.value
		)} disabled:opacity-50"
	/>
	<span class="text-[10px] text-muted/30">dB</span>
</div>
