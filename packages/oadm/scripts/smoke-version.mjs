import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const cliPath = resolve(here, '..', 'dist', 'cli.js');

const pkgRaw = await readFile(pkgPath, 'utf8');
const pkg = JSON.parse(pkgRaw);
const expected = pkg.version;

if (!expected) {
  throw new Error('package.json missing version');
}

const { stdout } = await execFileAsync('node', [cliPath, '--version']);
const actual = stdout.trim();

if (actual !== expected) {
  throw new Error(`version mismatch: expected ${expected} got ${actual}`);
}

console.log(`ok: ${actual}`);
