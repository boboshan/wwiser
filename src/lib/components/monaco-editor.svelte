<script lang="ts" module>
	// Monaco singleton - loaded once and shared across all editor instances
	let monacoPromise: Promise<typeof import('monaco-editor')> | null = null;

	async function getMonaco() {
		if (monacoPromise) return monacoPromise;

		monacoPromise = (async () => {
			// Configure Monaco environment before importing
			window.MonacoEnvironment = {
				getWorker() {
					// Minimal no-op worker - Monaco works fine without it for JSON
					const blob = new Blob(['self.onmessage = function() {};'], {
						type: 'application/javascript'
					});
					return new Worker(URL.createObjectURL(blob));
				}
			};

			const monaco = await import('monaco-editor');

			// Define custom theme matching our design system
			monaco.editor.defineTheme('wwiser-dark', {
				base: 'vs-dark',
				inherit: true,
				rules: [
					{ token: 'string.key.json', foreground: 'ff7f00' },
					{ token: 'string.value.json', foreground: '98c379' },
					{ token: 'number', foreground: 'd19a66' },
					{ token: 'keyword', foreground: 'c678dd' }
				],
				colors: {
					'editor.background': '#09090b', // zinc-950 - matches console
					'editor.foreground': '#a1a1aa', // zinc-400
					'editor.lineHighlightBackground': '#18181b',
					'editor.selectionBackground': '#3f3f46',
					'editorCursor.foreground': '#ff7f00',
					'editorLineNumber.foreground': '#52525b',
					'editorIndentGuide.background': '#27272a',
					'scrollbarSlider.background': '#27272a80',
					'scrollbarSlider.hoverBackground': '#3f3f4680',
					'scrollbarSlider.activeBackground': '#52525b80'
				}
			});

			monaco.editor.defineTheme('wwiser-light', {
				base: 'vs',
				inherit: true,
				rules: [
					{ token: 'string.key.json', foreground: 'c45500' },
					{ token: 'string.value.json', foreground: '50a14f' },
					{ token: 'number', foreground: '986801' },
					{ token: 'keyword', foreground: 'a626a4' }
				],
				colors: {
					'editor.background': '#18181b', // zinc-900 - code always dark
					'editor.foreground': '#a1a1aa', // zinc-400
					'editor.lineHighlightBackground': '#27272a',
					'editor.selectionBackground': '#3f3f46',
					'editorCursor.foreground': '#ff7f00',
					'editorLineNumber.foreground': '#52525b',
					'editorIndentGuide.background': '#27272a',
					'scrollbarSlider.background': '#27272a80',
					'scrollbarSlider.hoverBackground': '#3f3f4680',
					'scrollbarSlider.activeBackground': '#52525b80'
				}
			});

			return monaco;
		})();

		return monacoPromise;
	}
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	interface Props {
		value?: string;
		language?: string;
		readonly?: boolean;
		height?: string;
		onchange?: (value: string) => void;
	}

	let {
		value = '{}',
		language = 'json',
		readonly = false,
		height = '8rem',
		onchange
	}: Props = $props();

	let editor: import('monaco-editor').editor.IStandaloneCodeEditor | null = null;
	let themeObserver: MutationObserver | null = null;
	let internalValue: string; // Track to avoid update loops

	// Get current theme
	function getTheme(): string {
		if (!browser) return 'wwiser-dark';
		return document.documentElement.classList.contains('dark') ? 'wwiser-dark' : 'wwiser-light';
	}

	// Mount editor using action
	function mountEditor(container: HTMLElement) {
		if (!browser) return;

		const initialValue = value; // Capture for initialization

		getMonaco().then((monaco) => {
			editor = monaco.editor.create(container, {
				value: initialValue,
				language,
				theme: getTheme(),
				readOnly: readonly,
				minimap: { enabled: false },
				lineNumbers: 'off',
				glyphMargin: false,
				folding: false,
				lineDecorationsWidth: 8, // Left padding
				lineNumbersMinChars: 0,
				scrollBeyondLastLine: false,
				automaticLayout: true,
				tabSize: 2,
				fontSize: 13,
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				fontLigatures: false,
				padding: { top: 12, bottom: 12 },
				scrollbar: {
					vertical: 'auto',
					horizontal: 'auto',
					verticalScrollbarSize: 8,
					horizontalScrollbarSize: 8,
					useShadows: false
				},
				overviewRulerLanes: 0,
				hideCursorInOverviewRuler: true,
				overviewRulerBorder: false,
				renderLineHighlight: 'none',
				wordWrap: 'on',
				wrappingStrategy: 'advanced',
				contextmenu: false,
				quickSuggestions: language === 'json',
				suggestOnTriggerCharacters: language === 'json',
				formatOnPaste: true,
				formatOnType: true
			});

			internalValue = initialValue;

			// Listen for content changes
			editor.onDidChangeModelContent(() => {
				if (editor) {
					internalValue = editor.getValue();
					onchange?.(internalValue);
				}
			});

			// Watch for theme changes
			themeObserver = new MutationObserver(() => {
				monaco.editor.setTheme(getTheme());
			});

			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ['class']
			});
		});

		return {
			destroy() {
				themeObserver?.disconnect();
				editor?.dispose();
				editor = null;
			}
		};
	}

	// Handle external value updates
	$effect.pre(() => {
		if (editor && value !== internalValue) {
			const pos = editor.getPosition();
			editor.setValue(value);
			internalValue = value;
			if (pos) editor.setPosition(pos);
		}
	});

	// Cleanup
	onDestroy(() => {
		themeObserver?.disconnect();
		editor?.dispose();
	});

	// Expose methods
	export function getValue(): string {
		return editor?.getValue() ?? value;
	}

	export function setValue(newValue: string) {
		if (editor) {
			editor.setValue(newValue);
			internalValue = newValue;
		}
	}

	export function focus() {
		editor?.focus();
	}
</script>

<div
	class="monaco-editor-container border border-base rounded-lg overflow-hidden"
	style:height
	use:mountEditor
></div>

<style>
	.monaco-editor-container {
		/* Code editors always use dark background for better readability */
		background: #18181b; /* zinc-900 */
	}

	:global(.dark) .monaco-editor-container {
		background: #09090b; /* zinc-950 */
	}

	/* Hide Monaco's focus outline - we use our own */
	.monaco-editor-container :global(.monaco-editor),
	.monaco-editor-container :global(.monaco-editor-background) {
		border-radius: 0.5rem;
	}

	/* Improve scrollbar styling */
	.monaco-editor-container :global(.decorationsOverviewRuler) {
		display: none !important;
	}
</style>
