import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Assembled so this file never matches itself.
const RENAMED = [
	't' + 'ext-base',
	't' + 'ext-subtle',
	'b' + 'order-base',
	'b' + 'order-input',
	'b' + 'order-subtle',
	'b' + 'g-elevated'
];
const ENGINE = ['virtual:' + 'uno.css', 'uno' + 'css', 'uno.' + 'config'];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

describe('tailwind migration: no stale tokens', () => {
	const files = walk('src')
		.filter((f) => !f.endsWith('styles-migration.spec.ts'))
		.map((f) => [f, readFileSync(f, 'utf8')] as const);

	it('has no renamed shortcut names left in markup', () => {
		const offenders = files
			.filter(([, c]) => RENAMED.some((t) => c.includes(t)))
			.map(([f]) => f);
		expect(offenders).toEqual([]);
	});

	it('has no UnoCSS engine references', () => {
		const offenders = files
			.filter(([, c]) => ENGINE.some((t) => c.includes(t)))
			.map(([f]) => f);
		expect(offenders).toEqual([]);
	});
});
