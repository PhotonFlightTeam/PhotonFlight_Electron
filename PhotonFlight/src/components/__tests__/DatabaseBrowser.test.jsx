import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseBrowser from '../DatabaseBrowser';

const clerkMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/electron/react', () => ({
  useAuth: () => ({ getToken: clerkMocks.getToken }),
}));

const lidarFiles = [{
  lidar_id: 14,
  map_id: 5,
  file_location: 'site.laz',
  file_format: 'LAZ',
  uploaded_at: '2026-10-28T12:00:00Z',
  file_size_bytes: 128,
}];
const userMaps = [{ map_id: 5, name: 'Campus' }];

describe('DatabaseBrowser', () => {
  let openDatabaseBrowser;

  beforeEach(() => {
    openDatabaseBrowser = null;
    clerkMocks.getToken.mockReset().mockResolvedValue('session-token');
    window.electronAPI = {
      onOpenDatabaseBrowser: vi.fn((callback) => {
        openDatabaseBrowser = callback;
        return vi.fn();
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => userMaps };
      }
      return { ok: true, json: async () => lidarFiles };
    }));
  });

  it('loads lidar files and maps when opened from the application menu', async () => {
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());

    expect(await screen.findByText('site.laz')).toBeInTheDocument();
    expect(screen.getByText(/LAZ · Map: Campus/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/lidar?map_id=5&limit=50&offset=0',
      { headers: { Authorization: 'Bearer session-token' } },
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/maps?limit=100&offset=0',
      { headers: { Authorization: 'Bearer session-token' } },
    );
    expect(clerkMocks.getToken).toHaveBeenCalledWith({ template: 'photonflight' });
  });

  it('reloads lidar files when the selected map changes', async () => {
    const maps = [
      { map_id: 5, name: 'Campus' },
      { map_id: 6, name: 'Annex' },
    ];
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => maps };
      }
      const mapId = new URL(url).searchParams.get('map_id');
      return {
        ok: true,
        json: async () => [{
          ...lidarFiles[0],
          map_id: Number(mapId),
          file_location: mapId === '6' ? 'annex.laz' : 'site.laz',
        }],
      };
    });
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());
    expect(await screen.findByText('site.laz')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Map' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Annex' }));

    expect(await screen.findByText('annex.laz')).toBeInTheDocument();
    expect(screen.queryByText('site.laz')).not.toBeInTheDocument();
    expect(fetch.mock.calls.map(([url]) => String(url))).toContain(
      'http://127.0.0.1:8000/api/lidar?map_id=6&limit=50&offset=0',
    );
  });

  it('loads additional pages for the selected map', async () => {
    const page = Array.from({ length: 50 }, (_, index) => ({
      ...lidarFiles[0],
      lidar_id: index + 1,
      file_location: `site-${index}.laz`,
    }));
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => userMaps };
      }
      const offset = Number(new URL(url).searchParams.get('offset'));
      return {
        ok: true,
        json: async () => offset === 0
          ? page
          : page.map((file) => ({ ...file, lidar_id: file.lidar_id + 50 })),
      };
    });
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    await waitFor(() => {
      expect(fetch.mock.calls.map(([url]) => String(url))).toContain(
        'http://127.0.0.1:8000/api/lidar?map_id=5&limit=50&offset=50',
      );
    });
  });

  it('creates a map and selects it for uploads when the account has no maps', async () => {
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).includes('/api/maps') && options.method === 'POST') {
        return { ok: true, json: async () => ({ map_id: 21, name: 'New Survey' }) };
      }
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => [] };
    });
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());
    fireEvent.change(await screen.findByRole('textbox', { name: /New map name/ }), {
      target: { value: 'New Survey' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save map' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/maps',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'New Survey' }),
        }),
      );
    });
    expect(await screen.findByRole('combobox', { name: 'Map' }))
      .toHaveTextContent('New Survey');
  });

  it('uploads the currently loaded file as multipart form data', async () => {
    const currentFile = {
      name: 'local.las',
      bytes: new Uint8Array([0x4c, 0x41, 0x53, 0x46]),
    };
    fetch.mockImplementation(async (url, options = {}) => {
      if (String(url).endsWith('/api/lidar/upload')) {
        return { ok: true, json: async () => ({ lidar_id: 15 }) };
      }
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => userMaps };
      }
      return { ok: true, json: async () => lidarFiles };
    });
    render(<DatabaseBrowser currentFile={currentFile} onLoadFile={vi.fn()} />);

    act(() => openDatabaseBrowser());
    const uploadButton = await screen.findByRole('button', { name: 'Upload current file' });
    await waitFor(() => expect(uploadButton).toBeEnabled());
    fireEvent.click(uploadButton);

    await waitFor(() => {
      const uploadCall = fetch.mock.calls.find(([url]) => String(url).endsWith('/api/lidar/upload'));
      expect(uploadCall).toBeDefined();
      expect(uploadCall[1].method).toBe('POST');
      expect(uploadCall[1].headers).toEqual({ Authorization: 'Bearer session-token' });
      expect(uploadCall[1].body.get('map_id')).toBe('5');
      expect(uploadCall[1].body.get('file').name).toBe('local.las');
    });
  });

  it('downloads a selected file and sends its bytes to the viewer', async () => {
    const downloadedBytes = new ArrayBuffer(4);
    const onLoadFile = vi.fn();
    fetch.mockImplementation(async (url) => {
      if (String(url).endsWith('/api/lidar/14/file')) {
        return { ok: true, arrayBuffer: async () => downloadedBytes };
      }
      if (String(url).includes('/api/maps')) {
        return { ok: true, json: async () => userMaps };
      }
      return { ok: true, json: async () => lidarFiles };
    });
    render(<DatabaseBrowser onLoadFile={onLoadFile} />);

    act(() => openDatabaseBrowser());
    fireEvent.click(await screen.findByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(onLoadFile).toHaveBeenCalledWith(downloadedBytes);
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/lidar/14/file',
      { headers: { Authorization: 'Bearer session-token' } },
    );
  });

  it('shows an API error and offers a retry', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Clerk JWT verification is not configured.' }),
    });
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());

    expect(await screen.findByText('Clerk JWT verification is not configured.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('unsubscribes from the menu event when unmounted', async () => {
    const unsubscribe = vi.fn();
    window.electronAPI.onOpenDatabaseBrowser.mockImplementation((callback) => {
      openDatabaseBrowser = callback;
      return unsubscribe;
    });
    const { unmount } = render(<DatabaseBrowser />);

    await waitFor(() => expect(openDatabaseBrowser).toBeTypeOf('function'));
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
