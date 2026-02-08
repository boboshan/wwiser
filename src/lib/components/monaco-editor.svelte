<script lang="ts" module>
	// Monaco singleton - loaded once and shared across all editor instances
	type Monaco = typeof import('monaco-editor');
	let monacoPromise: Promise<Monaco> | null = null;

	async function getMonaco(): Promise<Monaco> {
		if (monacoPromise) return monacoPromise;

		monacoPromise = (async () => {
			// Import only the JSON worker (skip TS/CSS/HTML workers entirely)
			const [editorWorker, jsonWorker] = await Promise.all([
				import('monaco-editor/esm/vs/editor/editor.worker?worker'),
				import('monaco-editor/esm/vs/language/json/json.worker?worker')
			]);

			window.MonacoEnvironment = {
				getWorker(_, label) {
					if (label === 'json') return new jsonWorker.default();
					return new editorWorker.default();
				}
			};

			// Core editor API only — no bundled languages/workers
			// @ts-ignore — ESM subpath works at runtime; no .d.ts published
			const monaco = await import('monaco-editor/esm/vs/editor/editor.api');
			// JSON language support (validation, completions, formatting)
			// @ts-ignore — ESM subpath works at runtime; no .d.ts published
			await import('monaco-editor/esm/vs/language/json/monaco.contribution');

			// Define dark theme matching our design system
			monaco.editor.defineTheme('wwiser-dark', {
				base: 'vs-dark',
				inherit: true,
				rules: [
					{ token: 'string.key.json', foreground: '93b4ff' }, // wwise-300
					{ token: 'string.value.json', foreground: '86efac' }, // green-300
					{ token: 'number', foreground: 'fcd34d' }, // amber-300
					{ token: 'keyword', foreground: 'c4b5fd' } // violet-300
				],
				colors: {
					'editor.background': '#09090b', // surface-950 - darker than page bg
					'editor.foreground': '#d4d4d8', // surface-300
					'editor.lineHighlightBackground': '#3f3f46', // surface-700
					'editor.selectionBackground': '#52525b', // surface-600
					'editorCursor.foreground': '#3069ff', // wwise
					'editorLineNumber.foreground': '#71717a', // surface-500
					'editorIndentGuide.background': '#3f3f46', // surface-700
					'scrollbarSlider.background': '#52525b80',
					'scrollbarSlider.hoverBackground': '#71717a80',
					'scrollbarSlider.activeBackground': '#a1a1aa80'
				}
			});

			// Define light theme - distinct from page background
			monaco.editor.defineTheme('wwiser-light', {
				base: 'vs',
				inherit: true,
				rules: [
					{ token: 'string.key.json', foreground: '1340e1' }, // wwise-700
					{ token: 'string.value.json', foreground: '16a34a' }, // green-600
					{ token: 'number', foreground: 'd97706' }, // amber-600
					{ token: 'keyword', foreground: '7c3aed' } // violet-600
				],
				colors: {
					'editor.background': '#f4f4f5', // surface-100 - distinct from page bg
					'editor.foreground': '#3f3f46', // surface-700
					'editor.lineHighlightBackground': '#e4e4e7', // surface-200
					'editor.selectionBackground': '#bfd3ff', // wwise-200
					'editorCursor.foreground': '#3069ff', // wwise
					'editorLineNumber.foreground': '#a1a1aa', // surface-400
					'editorIndentGuide.background': '#e4e4e7', // surface-200
					'scrollbarSlider.background': '#d4d4d880',
					'scrollbarSlider.hoverBackground': '#a1a1aa80',
					'scrollbarSlider.activeBackground': '#71717a80'
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
		/* Light mode - distinct from page background (surface-100) */
		background: #f4f4f5;
	}

	:global(.dark) .monaco-editor-container {
		/* Dark mode - surface-950 for contrast against page bg */
		background: #09090b;
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
