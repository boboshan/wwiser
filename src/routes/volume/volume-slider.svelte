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

	// Piecewise curve split at 0 dB
	// Below 0: power of 3 curve (compress -96 to 0)
	// Above 0: linear (full resolution for 0 to +12)
	const MIN_DB = -96;
	const MAX_DB = 12;
	const SPLIT_DB = 0;
	const SPLIT_POS = 0.75; // 0 dB at 75% of slider
	const CURVE_POWER = 3;

	function dbToSlider(db: number): number {
		if (db <= SPLIT_DB) {
			// Map -96 to 0 -> 0 to 0.75 with power curve (compress low end)
			const normalized = (db - MIN_DB) / (SPLIT_DB - MIN_DB); // 0 to 1
			return Math.pow(normalized, CURVE_POWER) * SPLIT_POS;
		} else {
			// Map 0 to +12 -> 0.75 to 1.0 linear
			return ((db - SPLIT_DB) / (MAX_DB - SPLIT_DB)) * (1 - SPLIT_POS) + SPLIT_POS;
		}
	}

	function sliderToDb(pos: number): number {
		if (pos <= SPLIT_POS) {
			// Map 0 to 0.75 -> -96 to 0 with power curve
			const normalized = Math.pow(pos / SPLIT_POS, 1 / CURVE_POWER);
			return normalized * (SPLIT_DB - MIN_DB) + MIN_DB;
		} else {
			// Map 0.75 to 1.0 -> 0 to +12 linear
			return ((pos - SPLIT_POS) / (1 - SPLIT_POS)) * (MAX_DB - SPLIT_DB) + SPLIT_DB;
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

	// Derived slider position from dB value
	let sliderPosition = $derived(dbToSlider(slider.value));

	function handleSliderInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const pos = parseFloat(input.value);
		slider.value = Math.round(sliderToDb(pos) * 10) / 10; // Round to 0.1
	}

	function handleSliderChange() {
		slider.commit(oncommit);
	}

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
		min="0"
		max="1"
		step="0.001"
		value={sliderPosition}
		oninput={handleSliderInput}
		onchange={handleSliderChange}
		{disabled}
		class="accent-wwise h-1 w-28 cursor-pointer disabled:opacity-50 sm:w-40"
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
