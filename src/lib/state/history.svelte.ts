/**
 * Global Undo/Redo History Store
 *
 * Tracks Wwise undo group names so the UI can display
 * "Undo: Rename Objects" / "Redo: Copy Objects" like Wwise Authoring.
 */

function createHistoryStore() {
	let undoStack = $state<string[]>([]);
	let redoStack = $state<string[]>([]);
	let isUndoing = $state(false);
	let isRedoing = $state(false);
	let internalOpDepth = 0;
	let graceTimer: ReturnType<typeof setTimeout> | null = null;

	return {
		/** The label of the next undoable operation, or null */
		get undoLabel(): string | null {
			return undoStack.length > 0 ? undoStack[undoStack.length - 1] : null;
		},

		/** The label of the next redoable operation, or null */
		get redoLabel(): string | null {
			return redoStack.length > 0 ? redoStack[redoStack.length - 1] : null;
		},

		get canUndo(): boolean {
			return undoStack.length > 0;
		},

		get canRedo(): boolean {
			return redoStack.length > 0;
		},

		get isUndoing(): boolean {
			return isUndoing;
		},

		get isRedoing(): boolean {
			return isRedoing;
		},

		/** Mark the start of a Wwiser-initiated operation */
		beginInternalOp() {
			if (graceTimer) {
				clearTimeout(graceTimer);
				graceTimer = null;
			}
			internalOpDepth++;
		},

		/** Mark the end of a Wwiser-initiated operation (with grace period for late-arriving events) */
		endInternalOp() {
			// Small grace period so WAAPI notifications from our own operation
			// don't falsely trigger an external-change clear
			graceTimer = setTimeout(() => {
				internalOpDepth = Math.max(0, internalOpDepth - 1);
				graceTimer = null;
			}, 600);
		},

		/** Called by WAAPI change subscriptions — clears labels if the change was external */
		onExternalChange() {
			if (internalOpDepth > 0) return;
			undoStack = [];
			redoStack = [];
		},

		/** Called when a Wwise undo group is successfully completed */
		push(displayName: string) {
			undoStack = [...undoStack, displayName];
			// New operation invalidates the redo stack
			redoStack = [];
		},

		/** Move the top of the undo stack to redo (called after wwise.undo()) */
		didUndo() {
			if (undoStack.length === 0) return;
			const label = undoStack[undoStack.length - 1];
			undoStack = undoStack.slice(0, -1);
			redoStack = [...redoStack, label];
		},

		/** Move the top of the redo stack to undo (called after wwise.redo()) */
		didRedo() {
			if (redoStack.length === 0) return;
			const label = redoStack[redoStack.length - 1];
			redoStack = redoStack.slice(0, -1);
			undoStack = [...undoStack, label];
		},

		setUndoing(value: boolean) {
			isUndoing = value;
		},

		setRedoing(value: boolean) {
			isRedoing = value;
		},

		/** Reset everything (e.g. on disconnect) */
		clear() {
			undoStack = [];
			redoStack = [];
			isUndoing = false;
			isRedoing = false;
		}
	};
}

export const historyStore = createHistoryStore();
