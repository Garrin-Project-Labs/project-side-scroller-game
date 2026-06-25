import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
  }
}

const jsFiles = [
  'docs/src/game.js',
  ...readdirSync('docs/src', { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'game.js')
    .map(entry => join('docs/src', entry.name)),
  ...readdirSync('scripts', { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
    .map(entry => join('scripts', entry.name)),
  ...readdirSync('test', { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
    .map(entry => join('test', entry.name)),
];

for (const file of jsFiles) run('node', ['--check', file]);

const requiredFiles = [
  'docs/index.html',
  'docs/src/style.css',
  'docs/src/game.js',
  'docs/src/assets/robot.svg',
  'docs/src/assets/battery.svg',
  'docs/src/assets/crate.svg',
  'docs/src/assets/platform.svg',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Required file missing: ${file}`);
}

run('python3', ['-c', `
import glob
import xml.etree.ElementTree as ET
for path in sorted(glob.glob('docs/src/assets/*.svg')):
    ET.parse(path)
    print('svg ok', path)
`]);

const html = readFileSync('docs/index.html', 'utf8');
for (const expected of ['./src/style.css', './src/game.js', 'phaser@3.90.0']) {
  if (!html.includes(expected)) throw new Error(`docs/index.html missing reference: ${expected}`);
}

console.log('check ok');
