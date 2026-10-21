// Reexporta a casinha e o ogro de "ogro e sua casa.blend": npm run export-ogre
// Defina BLENDER se o Blender estiver em outro lugar.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blender = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const args = [
  '-b', path.join(root, 'ogro e sua casa.blend'),
  '--python', path.join(root, 'tools', 'export_ogre.py'),
  '--', path.join(root, 'public', 'ogre'),
];
const r = spawnSync(blender, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
