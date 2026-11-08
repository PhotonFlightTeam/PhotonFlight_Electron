import { BrowserWindow, Menu, dialog, type BaseWindow, type KeyboardEvent, type MenuItem, type MenuItemConstructorOptions } from 'electron';
import { importPlugins } from './pluginManager';


function getWindow(baseWindow: BaseWindow | undefined): BrowserWindow | null {
  if (baseWindow instanceof BrowserWindow) return baseWindow;
  return BrowserWindow.getFocusedWindow();
}

export function setupApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import',
          click: async (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            const window = getWindow(baseWindow);
            if (!window) return;

            const { canceled, filePaths } = await dialog.showOpenDialog(window, {
              properties: ['openFile'],
              filters: [
                { name: 'LAS/LAZ Files', extensions: ['las', 'laz'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            });
            if (!canceled && filePaths.length > 0) {
              window.webContents.send('file-imported', filePaths[0]);
            }
          },
        },
        {
          label: 'Export',
          click: async (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            const window = getWindow(baseWindow);
            if (!window) return;

            const { canceled, filePath } = await dialog.showSaveDialog(window, {
              filters: [
                { name: 'LAS File', extensions: ['las'] },
                { name: 'LAZ File', extensions: ['laz'] },
              ],
            });
            if (!canceled && filePath) {
              window.webContents.send('file-exported', filePath);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Plugins',
      submenu: [
        {
          label: 'Library',
          click: (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            getWindow(baseWindow)?.webContents.send('open-plugin-library');
          },
        },
        {
          label: 'Import...',
          click: async (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            const window = getWindow(baseWindow);
            if (!window) return;

            try {
              const id = await importPlugins(window);
              if (id) {
                window.webContents.send('plugins-changed');
                window.webContents.send('open-plugin-library');
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              dialog.showErrorBox('Plugin import failed', message);
            }
          },
        },
      ],
    },
    {
      label: 'Account',
      submenu: [
        {
          label: 'Sign Out',
          click: (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            getWindow(baseWindow)?.webContents.send('user-signed-out');
          },
        },
      ],
    },
    {
      label: 'Options',
      submenu: [
        {
          label: 'Settings',
          click: (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            getWindow(baseWindow)?.webContents.send('settings-opened');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}