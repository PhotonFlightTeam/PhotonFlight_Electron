import { BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Plugin JARs live under PHOTON_CORE_STATE_DIR, or ~/.photonflight/core by default —
// matching exactly where the JVM's PluginLoader looks.
function pluginsDir() {
    const directory = process.env.PHOTON_CORE_STATE_DIR;
    const stateDir = !directory || !directory.trim()
        ? path.join(os.homedir(), '.photonflight', 'core')
        : directory;
    return path.join(stateDir, 'plugins');
}

const statePath = () => path.join(pluginsDir(), 'plugins-state.json');

async function readState() {
    try {
        return JSON.parse(await fs.readFile(statePath(), 'utf8'));
    } catch {
        return {};
    }
}

async function writeState(state) {
    await fs.mkdir(pluginsDir(), { recursive: true });
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2));
}

// Jar names look like "my-plugin-1.2.3.jar"; the trailing -<digits> part is treated as the version
export async function listCorePlugins() {
    let entries;
    try {
        entries = await fs.readdir(pluginsDir(), { withFileTypes: true });
    } catch {
        return []; // The core hasn't created its plugins dir yet
    }

    const state = await readState();
    return entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.jar'))
        .map((entry) => {
            const id = entry.name.slice(0, -'.jar'.length);
            const [, name, version] = id.match(/^(.+?)-(\d[\w.]*)$/) ?? [null, id, ''];
            return { id, name, version, enabled: state[id]?.enabled ?? true, active: false };
        });
}

// Opens a file picker for .jar files and copies them into the plugins directory.
// Returns the copied filename(s), or null if the user canceled.
export async function importPlugin(browserWindow) {
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
        title: 'Select one or more core plugin JARs',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Plugin JARs', extensions: ['jar'] }],
    });
    if (canceled || filePaths.length === 0) return null;

    const dest = pluginsDir();
    await fs.mkdir(dest, { recursive: true });
    const names = [];
    for (const src of filePaths) {
        const name = path.basename(src);
        const target = path.join(dest, name);
        if (path.resolve(src) !== target) {
            await fs.copyFile(src, target);
        }
        names.push(name);
    }
    return names;
}

export async function setPluginEnabled(id, enabled) {
    if (typeof id !== 'string' || !id) throw new Error(`Invalid plugin id: ${id}`);
    const state = await readState();
    state[id] = { ...state[id], enabled: !!enabled };
    await writeState(state);
}

export function registerPluginHandlers() {
    ipcMain.handle('plugins:list-core', () => listCorePlugins());
    ipcMain.handle('plugins:import-core', (event) => importPlugin(BrowserWindow.fromWebContents(event.sender)));
    ipcMain.handle('plugins:set-enabled', (_event, id, enabled) => setPluginEnabled(id, enabled));
}
