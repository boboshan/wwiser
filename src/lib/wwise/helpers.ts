/**
 * Shared Wwise helper utilities
 * Centralized functions used across multiple tool pages
 */

/** The null GUID Wwise uses to represent an unset reference */
export const NULL_GUID = '{00000000-0000-0000-0000-000000000000}';

/** Check whether a GUID is null / empty / unset */
export function isNullGuid(id?: string | null): boolean {
	return !id || id === NULL_GUID;
}

/** Normalize a Wwise GUID for comparison (strip braces, lowercase) */
export function normalizeId(id: string): string {
	return id.replace(/[{}]/g, '').toLowerCase();
}
