import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STALE = 'wwiser' + '.net';
const ROOTS = ['src', 'static'];

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? walk(p) : [p];
	});
}

describe('no stale domain references', () => {
	it('has no wwiser.net literal under src/ or static/', () => {
		const offenders = ROOTS.flatMap(walk).filter((file) =>
			readFileSync(file, 'utf8').includes(STALE)
		);
		expect(offenders).toEqual([]);
	});
});
