import { BrowserWindow, Menu, dialog, type BaseWindow, type KeyboardEvent, type MenuItem, type MenuItemConstructorOptions } from 'electron';
import { importPlugin } from './pluginManager';

interface ApplicationMenuOptions {
  databaseMenuEnabled?: boolean;
}

function getWindow(baseWindow: BaseWindow | undefined): BrowserWindow | null {
  if (baseWindow instanceof BrowserWindow) return baseWindow;
  return BrowserWindow.getFocusedWindow();
}

export function setupApplicationMenu(
  
  themeMode: 'dark' | 'light' = 'dark',
  {
  databaseMenuEnabled = false }: ApplicationMenuOptions = {},

  controlMode: 'position' | 'flight' = 'position',
): void {
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
              try {
                window.webContents.send('file-imported', filePaths[0]);
              } catch (error) {
                dialog.showErrorBox('Import failed', error instanceof Error ? error.message : String(error));
              }
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
        {
          label: 'Maps',
          id: 'database',
          enabled: databaseMenuEnabled,
          click: (_menuItem: MenuItem, baseWindow?: BaseWindow) => {
            getWindow(baseWindow)?.webContents.send('open-database-browser');
          }
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
          label: 'Add Plugin...',
          click: async (_menuItem: MenuItem, baseWindow?: BaseWindow, _event?: KeyboardEvent) => {
            const window = getWindow(baseWindow);
            if (!window) return;

            try {
              const names = await importPlugin(window);
              if (names) {
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
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Dark',
              type: 'radio',
              checked: themeMode === 'dark',
              click: (_menuItem: MenuItem, baseWindow?: BaseWindow) => {
                getWindow(baseWindow)?.webContents.send('theme-mode-changed', 'dark');
              },
            },
            {
              label: 'Light',
              type: 'radio',
              checked: themeMode === 'light',
              click: (_menuItem: MenuItem, baseWindow?: BaseWindow) => {
                getWindow(baseWindow)?.webContents.send('theme-mode-changed', 'light');
               // setAllPointCloudColors([0, 0.4, 1])
              },
            },
          ],
        },
        {
          label: 'Controls',
          submenu: [
            {
              label: 'Flight',
              type: 'radio',
              checked: controlMode === 'flight',
              click: (_menuItem: MenuItem, baseWindow?: BaseWindow) => {
                getWindow(baseWindow)?.webContents.send('control-mode-changed', 'flight');
              },
            },
            {
              label: 'Position',
              type: 'radio',
              checked: controlMode === 'position',
              click: (_menuItem: MenuItem, baseWindow?: BaseWindow) => {
                getWindow(baseWindow)?.webContents.send('control-mode-changed', 'position');
              },
            },
          ],
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}