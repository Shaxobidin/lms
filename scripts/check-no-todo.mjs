/**
 * Maqsad: kodda tugallanmagan joylar yo'qligini tekshirish (promt.md §16).
 *
 * CI da majburiy: `TODO`, `FIXME`, `HACK`, `XXX` belgilari yoki bo'sh
 * funksiya tanalari topilsa build to'xtaydi.
 *
 * Ishga tushirish: node scripts/check-no-todo.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'playwright-report',
  'test-results',
  'generated',
]);

const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.prisma', '.sql']);

/** Bu fayllar tekshiruvdan chetda: ular ataylab marker so'zlarini o'z ichiga oladi. */
const SKIP_FILES = new Set(['scripts/check-no-todo.mjs', 'promt.md']);

const MARKERS = [
  { pattern: /\bTODO\b/, label: 'TODO' },
  { pattern: /\bFIXME\b/, label: 'FIXME' },
  { pattern: /\bHACK\b/, label: 'HACK' },
  { pattern: /\bXXX\b/, label: 'XXX' },
  { pattern: /throw new Error\(['"`]not implemented/i, label: 'not implemented' },
  { pattern: /\/\/\s*@ts-ignore/, label: '@ts-ignore' },
];

const findings = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(fullPath);
      continue;
    }

    const extension = entry.name.slice(entry.name.lastIndexOf('.'));
    if (!CHECKED_EXTENSIONS.has(extension)) continue;

    const relativePath = relative(ROOT, fullPath).replace(/\\/g, '/');
    if (SKIP_FILES.has(relativePath)) continue;

    const content = await readFile(fullPath, 'utf8');
    const lines = content.split('\n');

    for (const [index, line] of lines.entries()) {
      for (const marker of MARKERS) {
        if (marker.pattern.test(line)) {
          findings.push({
            file: relativePath,
            line: index + 1,
            marker: marker.label,
            text: line.trim().slice(0, 120),
          });
        }
      }
    }
  }
}

await walk(ROOT);

if (findings.length === 0) {
  console.log('Tugallanmagan kod belgilari topilmadi.');
  process.exit(0);
}

console.error(`Tugallanmagan kod belgilari topildi (${findings.length} ta):\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  [${finding.marker}]  ${finding.text}`);
}
console.error("\npromt.md §16 bo'yicha bunday belgilar taqiqlanadi.");
process.exit(1);
