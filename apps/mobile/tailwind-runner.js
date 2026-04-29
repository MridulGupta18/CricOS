#!/usr/bin/env node
// Wrapper used by NativeWind metro. Runs tailwindcss then writes "Done in Xms."
// to stderr so NativeWind's pipe listener resolves correctly on Windows.
const { execFileSync } = require('child_process');
const path = require('path');

const twBin = path.join(__dirname, '..', '..', 'node_modules', 'tailwindcss', 'lib', 'cli.js');
// Strip --watch: execFileSync blocks on watch mode; one-shot build is enough for web preview
const args = process.argv.slice(2).filter(a => a !== '--watch');

const start = Date.now();
try {
  execFileSync(process.execPath, [twBin, ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
} catch (e) {
  process.stderr.write(e.message + '\n');
  process.exit(1);
}
const ms = Date.now() - start;
process.stderr.write(`Done in ${ms}ms.\n`);
