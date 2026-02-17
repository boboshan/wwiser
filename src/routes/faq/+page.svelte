<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';

	type Segment = { text: string } | { code: string } | { bold: string };

	interface FaqItem {
		question: string;
		answer: Segment[];
	}

	const faqs: FaqItem[] = [
		{
			question: 'How do I allow Wwiser to connect to Wwise?',
			answer: [
				{ text: 'In Wwise, go to ' },
				{ bold: 'User Preferences → Allow browser connections from' },
				{ text: ' and add ' },
				{ code: 'https://wwiser.net' },
				{ text: '. Do not include ' },
				{ code: '/' },
				{ text: ' at the end — the address must be exactly ' },
				{ code: 'https://wwiser.net' },
				{
					text: ' with nothing after it. Then enter the same address in the connection panel on Wwiser and click Connect.'
				}
			]
		}
	];

	let openIndex = $state<number | null>(0);

	function toggle(i: number) {
		openIndex = openIndex === i ? null : i;
	}
</script>

<div class="flex flex-col gap-6 max-w-2xl">
	<!-- Intro -->
	<div class="space-y-4">
		<p class="text-sm text-muted leading-relaxed max-w-xl">
			Common questions and troubleshooting tips for working with Wwiser and WAAPI.
		</p>
	</div>

	<!-- FAQ items -->
	<section class="space-y-2">
		{#each faqs as faq, i (i)}
			<div
				class="border border-transparent rounded-xl bg-base transition-colors hover:border-surface-200 dark:hover:border-surface-700"
			>
				<button
					onclick={() => toggle(i)}
					class="p-4 text-left flex gap-3 w-full cursor-pointer items-start"
					aria-expanded={openIndex === i}
				>
					<ChevronDown
						class="text-muted/40 mt-0.5 shrink-0 h-4 w-4 transition-transform duration-200 {openIndex ===
						i
							? 'rotate-180'
							: ''}"
					/>
					<span class="text-sm text-base leading-relaxed font-medium">{faq.question}</span>
				</button>
				{#if openIndex === i}
					<div class="faq-answer px-4 pb-4 pl-11">
						<p class="text-xs text-muted/60 leading-relaxed">
							{#each faq.answer as seg, j (j)}
								{#if 'code' in seg}<code>{seg.code}</code>{:else if 'bold' in seg}<strong
										>{seg.bold}</strong
									>{:else}{seg.text}{/if}
							{/each}
						</p>
					</div>
				{/if}
			</div>
		{/each}
	</section>
</div>

<style>
	.faq-answer :global(code) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.95em;
		padding: 0.15em 0.4em;
		border-radius: 0.375rem;
		background-color: rgba(48, 105, 255, 0.08);
		color: rgba(48, 105, 255, 0.85);
	}

	:global(.dark) .faq-answer :global(code) {
		background-color: rgba(48, 105, 255, 0.15);
		color: rgba(100, 150, 255, 0.9);
	}

	.faq-answer :global(strong) {
		font-weight: 600;
		color: var(--color-surface-900, #111);
	}

	:global(.dark) .faq-answer :global(strong) {
		color: var(--color-surface-100, #eee);
	}
</style>
