<script lang="ts" module>
	// Monaco singleton — loaded once from CDN via modern-monaco and shared across all editor instances.
	// modern-monaco handles worker setup, Shiki-based syntax highlighting, and LSP automatically.
	import { init, Workspace, type TextmateTheme } from 'modern-monaco';

	type Monaco = Awaited<ReturnType<typeof init>>;

	// Shared state — initialised once across all editor instances
	let monacoPromise: Promise<Monaco> | null = null;
	let sharedWorkspace: Workspace | null = null;

	// Custom themes in TextMate format (for Shiki tokenization)
	const wwiserDark: TextmateTheme = {
		name: 'wwiser-dark',
		type: 'dark',
		colors: {
			'editor.background': '#09090b', // surface-950
			'editor.foreground': '#d4d4d8', // surface-300
			'editor.lineHighlightBackground': '#3f3f46', // surface-700
			'editor.selectionBackground': '#52525b', // surface-600
			'editorCursor.foreground': '#3069ff', // wwise
			'editorLineNumber.foreground': '#71717a', // surface-500
			'editorIndentGuide.background': '#3f3f46', // surface-700
			'scrollbarSlider.background': '#52525b80',
			'scrollbarSlider.hoverBackground': '#71717a80',
			'scrollbarSlider.activeBackground': '#a1a1aa80'
		},
		tokenColors: [
			{
				scope: 'support.type.property-name.json',
				settings: { foreground: '#93b4ff' } // wwise-300
			},
			{
				scope: ['string.quoted', 'string.template', 'string'],
				settings: { foreground: '#86efac' } // green-300
			},
			{ scope: 'constant.numeric', settings: { foreground: '#fcd34d' } }, // amber-300
			{
				scope: ['keyword', 'storage.type', 'storage.modifier'],
				settings: { foreground: '#c4b5fd' } // violet-300
			},
			{ scope: 'comment', settings: { foreground: '#71717a' } }, // surface-500
			{
				scope: ['variable', 'variable.other'],
				settings: { foreground: '#d4d4d8' } // surface-300
			},
			{
				scope: ['entity.name.type', 'support.type'],
				settings: { foreground: '#67e8f9' } // cyan-300
			},
			{
				scope: ['punctuation', 'meta.brace'],
				settings: { foreground: '#a1a1aa' } // surface-400
			}
		]
	};

	const wwiserLight: TextmateTheme = {
		name: 'wwiser-light',
		type: 'light',
		colors: {
			'editor.background': '#f4f4f5', // surface-100
			'editor.foreground': '#3f3f46', // surface-700
			'editor.lineHighlightBackground': '#e4e4e7', // surface-200
			'editor.selectionBackground': '#bfd3ff', // wwise-200
			'editorCursor.foreground': '#3069ff', // wwise
			'editorLineNumber.foreground': '#a1a1aa', // surface-400
			'editorIndentGuide.background': '#e4e4e7', // surface-200
			'scrollbarSlider.background': '#d4d4d880',
			'scrollbarSlider.hoverBackground': '#a1a1aa80',
			'scrollbarSlider.activeBackground': '#71717a80'
		},
		tokenColors: [
			{
				scope: 'support.type.property-name.json',
				settings: { foreground: '#1340e1' } // wwise-700
			},
			{
				scope: ['string.quoted', 'string.template', 'string'],
				settings: { foreground: '#16a34a' } // green-600
			},
			{ scope: 'constant.numeric', settings: { foreground: '#d97706' } }, // amber-600
			{
				scope: ['keyword', 'storage.type', 'storage.modifier'],
				settings: { foreground: '#7c3aed' } // violet-600
			},
			{ scope: 'comment', settings: { foreground: '#a1a1aa' } }, // surface-400
			{
				scope: ['variable', 'variable.other'],
				settings: { foreground: '#3f3f46' } // surface-700
			},
			{
				scope: ['entity.name.type', 'support.type'],
				settings: { foreground: '#0891b2' } // cyan-600
			},
			{
				scope: ['punctuation', 'meta.brace'],
				settings: { foreground: '#71717a' } // surface-500
			}
		]
	};

	function getTheme(): TextmateTheme {
		if (typeof document === 'undefined') return wwiserDark;
		return document.documentElement.classList.contains('dark') ? wwiserDark : wwiserLight;
	}

	// Sanitise file path — strip old Monaco `ts:` prefix, ensure .d.ts extension
	function sanitisePath(raw?: string): string {
		if (!raw) return `globals-${Math.random().toString(36).slice(2)}.d.ts`;
		return raw.replace(/^ts:/, '');
	}

	// Track which extra-lib paths have already been opened as text documents
	const openedLibs = new Set<string>();

	/**
	 * Initialise modern-monaco with a shared Workspace.
	 * Extra .d.ts files are written into the workspace AND opened as text
	 * documents so the TS LSP worker can discover them for IntelliSense.
	 */
	async function getMonaco(
		extraLibs?: Array<{ content: string; filePath?: string }>
	): Promise<Monaco> {
		if (monacoPromise) {
			const monaco = await monacoPromise;

			// Write new extra libs into the already-running workspace and open them
			if (sharedWorkspace && extraLibs?.length) {
				for (const lib of extraLibs) {
					const p = sanitisePath(lib.filePath);
					await sharedWorkspace.fs.writeFile(p, lib.content);
					if (!openedLibs.has(p)) {
						await sharedWorkspace.openTextDocument(p);
						openedLibs.add(p);
					}
				}
			}

			return monaco;
		}

		// Build initial files map from extraLibs (if first init has them)
		const initialFiles: Record<string, string> = {};
		if (extraLibs?.length) {
			for (const lib of extraLibs) {
				initialFiles[sanitisePath(lib.filePath)] = lib.content;
			}
		}

		sharedWorkspace = new Workspace({
			name: 'wwiser',
			initialFiles
		});

		monacoPromise = init({
			workspace: sharedWorkspace,
			themes: [wwiserDark, wwiserLight],
			defaultTheme: getTheme(),
			langs: ['json', 'javascript', 'typescript'],
			lsp: {
				formatting: { tabSize: 2, insertSpaces: true },
				typescript: {
					compilerOptions: {
						target: 99 /* ESNext */,
						module: 99 /* ESNext */,
						allowJs: true,
						checkJs: true
					}
				}
			}
		});

		const monaco = await monacoPromise;

		// Open extra-lib files as text documents so the TS LSP sees them
		if (extraLibs?.length) {
			for (const lib of extraLibs) {
				const p = sanitisePath(lib.filePath);
				if (!openedLibs.has(p)) {
					await sharedWorkspace!.openTextDocument(p);
					openedLibs.add(p);
				}
			}
		}

		return monaco;
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
		resizable?: boolean;
		extraLibs?: Array<{ content: string; filePath?: string }>;
		onchange?: (value: string) => void;
	}

	let {
		value = '{}',
		language = 'json',
		readonly = false,
		height = '8rem',
		resizable = false,
		extraLibs,
		onchange
	}: Props = $props();

	let editor: ReturnType<Monaco['editor']['create']> | null = null;
	let themeObserver: MutationObserver | null = null;
	let internalValue: string; // Track to avoid update loops

	// Generate a unique file name for this editor instance
	const modelId = Math.random().toString(36).slice(2);
	const langExt: Record<string, string> = { json: 'json', javascript: 'js', typescript: 'ts' };

	// Mount editor using action
	function mountEditor(container: HTMLElement) {
		if (!browser) return;

		const initialValue = value; // Capture for initialization

		getMonaco(extraLibs).then(async (monaco) => {
			const isJs = language === 'javascript';

			// Create file in workspace and open as a model so the TS LSP can find it
			const ext = langExt[language] ?? 'txt';
			const fileName = `sandbox-${modelId}.${ext}`;
			await sharedWorkspace!.fs.writeFile(fileName, initialValue);
			const model = await sharedWorkspace!.openTextDocument(fileName);

			editor = monaco.editor.create(container, {
				model,
				theme: getTheme().name,
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
				fixedOverflowWidgets: true,
				contextmenu: false,
				quickSuggestions: language === 'json' || isJs,
				suggestOnTriggerCharacters: language === 'json' || isJs,
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
				monaco.editor.setTheme(getTheme().name);
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
	class:resizable
	style:height
	use:mountEditor
></div>

<style>
	.monaco-editor-container {
		/* Light mode - distinct from page background (surface-100) */
		background: #f4f4f5;
	}

	.monaco-editor-container.resizable {
		resize: vertical;
		min-height: 4rem;
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
