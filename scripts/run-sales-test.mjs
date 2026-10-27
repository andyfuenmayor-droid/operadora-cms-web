import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetScript = path.resolve(__dirname, 'run-sales-engine-test.mjs');

const [major, minor] = process.versions.node.split('.').map(Number);
const supportsStripTypes = major > 22 || (major === 22 && minor >= 6);

if (supportsStripTypes) {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings', '--experimental-strip-types', targetScript],
    { stdio: 'inherit' }
  );
  process.exit(result.status ?? 0);
} else {
  console.warn(
    `⚠️  Aviso: Node ${process.version} no soporta --experimental-strip-types (requiere Node >= 22.6.0). Saltando verificación local de tipos.`
  );
  process.exit(0);
}
