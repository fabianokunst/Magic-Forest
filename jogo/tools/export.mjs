// Reexporta os assets do .blend: npm run assets
// Defina BLENDER se o Blender estiver em outro lugar.
import { spawnSync } from 'node:child_process';

const blender = process.env.BLENDER || 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const args = ['-b', '../ogro e sua casa.blend', '--python', 'tools/export_assets.py', '--', 'public/assets'];
const r = spawnSync(blender, args, { stdio: 'inherit' });
process.exit(r.status ?? 1);
