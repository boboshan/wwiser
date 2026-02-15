/**
 * Strip dev-only tool entries from site.ts after merging dev → main.
 *
 * Removes navigation items, pageSeo entries, unused icon imports, and type
 * union members for the specified tool IDs.
 *
 * Usage: node scripts/strip-dev-tools.mjs source-rename monitor
 *        SITE_TS=path/to/file.ts node scripts/strip-dev-tools.mjs source-rename monitor
 */
import { readFileSync, writeFileSync } from 'fs';

const SITE_TS = process.env.SITE_TS || 'src/lib/config/site.ts';
const ids = process.argv.slice(2);

if (ids.length === 0) {
	console.error('Usage: node scripts/strip-dev-tools.mjs <id1> [id2] ...');
	process.exit(1);
}

let src = readFileSync(SITE_TS, 'utf8');

for (const id of ids) {
	// ── Remove navigation array entries ──────────────────────────────────────
	// Match:  ,\n\t{ ... id: '<id>' ... }   (object block in the array)
	const navRe = new RegExp(
		`,?\\s*\\{[^{}]*id:\\s*'${id}'[^{}]*\\}`,
		's'
	);
	src = src.replace(navRe, '');

	// ── Remove pageSeo entries ───────────────────────────────────────────────
	// Match:  ,?\n\t<id>: { ... }
	const seoRe = new RegExp(
		`,?\\s*${id}:\\s*\\{[^}]*\\}`,
		's'
	);
	src = src.replace(seoRe, '');
}

// ── Clean up icon-related leftovers ──────────────────────────────────────────

// Map of dev-only id → icon name and import name
const devIconInfo = {
	'source-rename': { icon: 'file-audio', importName: 'FileHeadphone' },
	monitor: { icon: 'list-music', importName: 'ListMusic' }
};

for (const id of ids) {
	const info = devIconInfo[id];
	if (!info) continue;

	// Remove from NavIcon type union:   | 'file-audio'
	const typeRe = new RegExp(`\\s*\\|\\s*'${info.icon}'`, 'g');
	src = src.replace(typeRe, '');

	// Remove from iconMap:   'file-audio': FileHeadphone,
	const mapRe = new RegExp(`\\s*'${info.icon}':\\s*${info.importName},?\\n?`, 'g');
	src = src.replace(mapRe, '\n');

	// Remove import:   FileHeadphone,
	const importRe = new RegExp(`\\s*${info.importName},?\\n`, 'g');
	src = src.replace(importRe, '\n');
}

// Fix trailing commas before closing braces/brackets that might remain
src = src.replace(/,(\s*\})/g, '$1');
src = src.replace(/,(\s*\])/g, '$1');

writeFileSync(SITE_TS, src);
console.log(`Stripped dev-only entries for: ${ids.join(', ')}`);
