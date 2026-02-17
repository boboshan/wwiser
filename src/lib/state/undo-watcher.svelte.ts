/**
 * Undo/Redo history watcher
 *
 * Watches historyStore for undo/redo label changes and calls a refresh callback.
 * Eliminates the duplicated $effect pattern used in volume and analyze pages.
 */

import { untrack } from 'svelte';
import { historyStore } from '$lib/state/history.svelte';

/**
 * Create an effect that fires `onRefresh` whenever the undo/redo labels change.
 * Call this inside a component's reactive root (top-level script or $effect.root).
 *
 * @param hasData - A function that returns whether there is data to refresh (evaluated untracked)
 * @param onRefresh - Async callback invoked when labels change and data exists
 */
export function watchUndoRedo(hasData: () => boolean, onRefresh: () => Promise<void>): void {
	let prevUndoLabel: string | null | undefined;
	let prevRedoLabel: string | null | undefined;

	$effect(() => {
		const curUndo = historyStore.undoLabel;
		const curRedo = historyStore.redoLabel;

		if (prevUndoLabel === undefined) {
			prevUndoLabel = curUndo;
			prevRedoLabel = curRedo;
			return;
		}

		if (curUndo !== prevUndoLabel || curRedo !== prevRedoLabel) {
			prevUndoLabel = curUndo;
			prevRedoLabel = curRedo;
			if (untrack(hasData)) {
				onRefresh();
			}
		}
	});
}
