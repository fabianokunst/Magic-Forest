// Runs tools/export_assets.py in Blender (background) for every source .blend.
// Usage: npm run export-models   (set BLENDER=<path to blender.exe> if it is not in the default place)
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['House.blend', 'ogro e sua casa.blend'];

const candidates = [
  process.env.BLENDER,
  'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  'blender',
].filter(Boolean);
const blender = candidates.find((p) => p === 'blender' || existsSync(p));

const modelsDir = path.join(root, 'public', 'models');
const texturesDir = path.join(root, 'public', 'textures');
const cacheDir = path.join(root, 'tools', '.cache');
rmSync(cacheDir, { recursive: true, force: true });

for (const file of SOURCES) {
  console.log(`\n=== ${file}`);
  const result = spawnSync(
    blender,
    ['-b', path.join(root, file), '--python', path.join(root, 'tools', 'export_assets.py'),
      '--', modelsDir, texturesDir, cacheDir],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  // Keep only our own log lines, not Blender's startup/exporter chatter.
  const log = result.stdout.split('\n').filter((l) => /^(\[|  |\n|Traceback|Error|\w+Error)/.test(l) || l.startsWith('    '));
  console.log(log.join('\n'));
  if (result.status !== 0) {
    console.error(`Blender failed on ${file} (exit ${result.status})`);
    process.exit(1);
  }
}
rmSync(cacheDir, { recursive: true, force: true });
