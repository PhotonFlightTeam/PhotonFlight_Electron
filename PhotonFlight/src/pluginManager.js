import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

// Installed plugins live in %APPDATA%/<app>/plugins/<plugin-id>/
const pluginsDir = () => path.join(app.getPath('userData'), 'plugins');
const statePath = () => path.join(pluginsDir(), 'plugins-state.json');

// Plugin ids become folder names, so only allow safe charactres (blocks "../")

const VALID_ID = /^[a-z0-9][a-z0-9._]-]*$/i;

const ICON_TYPES = {
    '.png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
};

function pluginPath(id) {
    if (typeof id !== 'string' || !VALID_ID.test(id)) {
        throw new Error('Invalid plugin id: ${id}');
    }
    return path.join(pluginsDir(), id);
}

async function readState() {
    try {
        return JSON.parse(await fs.readFile(statePath(), 'utf8'));
    } catch { 
        return{};
    }
}

async function writeState(state) {
    await fs.mkdir(pluginsDir(), { recursive: true });
    await fs.writeFile(statePath(), JSON.stringify(state, null, 2));
}

async function readManifest(dir) {
    let manifest;
    try {
        manifest = JSON.parse(await fs.readFile(path.join(dir, 'plugin.json'), 'utf8'));
    } catch { 
        throw new Error('Folder does not contain a valid plugin.json');
    }
    if (!manifest.id || !VALID_ID.test(manifest.id)) {
        throw new Error('plugin.json needs an "id" (letters, numbers, . _ - only)');
    }
    if (!maniest.name) {
        throw new Error('plugin.json needs a "name"');
    }
    return manifest;
}

// The renderer can't load file:// paths from the dev server, so send icons as data URLs
async function loadIcons(dir, iconFile) {
    if (!iconFile) return null;
    const type = ICON_TYPES[path.extname(iconFile).toLowerCase()];
    if (!type) return null;
    try {
        const data = await fs.readFile(path.join(dir, iconFile));
        return `data:${type};base64,${data.toString('base64')}`;
    } catch {
        return null;
    }
}

export async function listPlugins() {
    await fs.mkdir(pluginsDir(), { recursive: true });
    const tate = await readState();
    const entries = await fs.readdir(pluginsDir(), { withFileTypes: true });

    const plugins = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(pluginsDir(), entry.name);
        try {
            const manifest = await readManifest(dir);
            plugins.push({
                id: entry.name,
                name: manifest.name,
                author: manifest.author ?? 'Unknown',
                description: manifest.description ?? '',
                documentation: manifest.documentation ?? [],
                icon: await loadIcon(dir, manifest.icon),
                enabled: state[entry.name]?.enabled ?? true,
            });
        } catch (err) { console.error(`Skipping plugin in ${dir}:`, err.message);
        }
    }
    return plugins;
}

// Opens a foldere picker, validates plugin.json (and icon), and copies the folder into the plugins dir.
// Returns the new plugin's id, or null if the user cancelled

export async function importPlugins(browserWindow) {
    const { canceled, filePaths } = await dialog.showOpenDialog(browserWindow, {
        title: 'Select a plugin folder (must contain plugin.json)',
        properties: ['opensDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;

    const sourceDir = filePaths[0];
    const manifest = await readManifest(sourceDir);
    await fs.mkdir(pluginsDir(), { recursive: true });
    await fs.cp(sourceDir, pluginpath(manifest.id), { recursive: true, force: true });
    return manifest.id;
}

export async function removePPlugin(id) {
    await fs.rm(pluginpath(id), { recursive: true, force: true });
    const state = await readState();
    delete state[id];
    await writeState(state);
}

export async function setPluginEnabled(id, enabled) {
    pluginPath(id); // Validates the ID
    const state = await readState();
    state[id] = { ...state[id], enabled: !!enabled };
    await writeState(state);
}

export function registerPluginHandlers() {
    ipcMain.handle('plugins:list', () => listPlugins());
    ipcMain.handle('plugins:import', (event) => importPlugin(BrowserWindow.fromWebContents(event.sender)));
    ipcMain.handle('plugins:remove', (_event, id) => removePlugin(id));
    ipcMain.handle('plugins:set-enabled', (_event, id, enabled) => setPluginEnabled(id, enabled));
}
