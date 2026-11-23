import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export function lazConverterOptions({ appPath, resourcesPath, isPackaged, cacheRoot, env = process.env }) {
  const script = isPackaged
    ? path.join(resourcesPath, 'convert.py')
    : path.join(appPath, '..', 'LasEditor', 'convert.py');
  const executable = process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'];
  const venvPython = ['venv', '.venv']
    .map((directory) => path.join(appPath, 'src', 'backend', directory, ...executable))
    .find(existsSync);
  const python = env.PHOTON_PYTHON || venvPython || (process.platform === 'win32' ? 'python' : 'python3');
  return { script, python, cacheRoot };
}

// Converts a .las file to a .laz in the app's cache (not /tmp) so it persists for Core's processing.
// Anything that is not a .las file is returned unchanged.
export async function convertLasToLaz(inputPath, { script, python, cacheRoot }) {
  const extension = path.extname(inputPath);
  if (extension.toLowerCase() !== '.las') return inputPath;

  await mkdir(cacheRoot, { recursive: true });
  const tempDirectory = await mkdtemp(path.join(cacheRoot, 'photonflight-laz-'));
  const tempLazPath = path.join(tempDirectory, `${path.basename(inputPath, extension)}.laz`);

  await new Promise((resolve, reject) => {
    const child = spawn(python, [script, inputPath, tempLazPath], { windowsHide: true, shell: false });
    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`LAS to LAZ conversion failed (exit ${code}). ${stderr.trim().slice(-500)}`));
    });
  });
  return tempLazPath;
}
