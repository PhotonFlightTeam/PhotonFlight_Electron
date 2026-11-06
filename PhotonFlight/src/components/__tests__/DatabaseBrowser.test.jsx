import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseBrowser from '../DatabaseBrowser';

const clerkMocks = vi.hoisted(() => ({
  getToken: vi.fn(),
}));

vi.mock('@clerk/electron/react', () => ({
  useAuth: () => ({ getToken: clerkMocks.getToken }),
}));

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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{
        lidar_id: 14,
        file_location: 'C:\\surveys\\site.laz',
        file_format: 'LAZ',
        uploaded_at: '2026-10-28T12:00:00Z',
        map_name: 'Campus',
      }],
    }));
  });

  it('loads and displays lidar files when opened from the application menu', async () => {
    render(<DatabaseBrowser />);

    act(() => openDatabaseBrowser());

    expect(await screen.findByText('site.laz')).toBeInTheDocument();
    expect(screen.getByText(/LAZ · Map: Campus/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/lidar?limit=50&offset=0',
      { headers: { Authorization: 'Bearer session-token' } },
    );
    expect(clerkMocks.getToken).toHaveBeenCalledWith({ template: 'photonflight' });
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
