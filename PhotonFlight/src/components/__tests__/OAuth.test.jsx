import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OAuth from '../OAuth';
import useStore from '../../useStore';

const clerkMocks = vi.hoisted(() => ({
  user: { isLoaded: true, isSignedIn: false, user: null },
  getToken: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@clerk/electron/react', () => ({
  SignInButton: ({ children }) => children,
  useAuth: () => ({ getToken: clerkMocks.getToken }),
  useUser: () => clerkMocks.user,
  useClerk: () => ({ signOut: clerkMocks.signOut }),
}));

vi.mock('../lasReader.jsx', () => ({
  default: ({ fileUrl }) => <div data-testid="las-viewer">{fileUrl}</div>,
}));

describe('OAuth', () => {
  let callbacks;

  beforeEach(() => {
    callbacks = {};
    clerkMocks.user = { isLoaded: true, isSignedIn: false, user: null };
    clerkMocks.getToken.mockReset().mockResolvedValue('session-token');
    clerkMocks.signOut.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ clerk_user_id: 'user_123', name: 'Pilot', email: 'pilot@example.com' }),
    }));
    useStore.setState({ user: null, min: [0, 1, 0], max: [1, 0, 0] });
    window.electronAPI = {
      onSignOutRequested: vi.fn((callback) => {
        callbacks.signOut = callback;
        return vi.fn();
      }),
      onSettingsOpened: vi.fn((callback) => {
        callbacks.settings = callback;
        return vi.fn();
      }),
      setDatabaseMenuEnabled: vi.fn(),
    };
  });

  it('shows sign-in and offline choices while signed out', () => {
    render(<OAuth />);

    expect(screen.getByRole('heading', { name: 'Photon Flight' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Offline Mode' })).toBeInTheDocument();
    expect(window.electronAPI.setDatabaseMenuEnabled).toHaveBeenLastCalledWith(false);
  });

  it('registers an authenticated Clerk user before enabling the database menu', async () => {
    clerkMocks.user = {
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_123',
        fullName: 'Pilot',
        username: 'pilot',
        primaryEmailAddress: { emailAddress: 'pilot@example.com' },
      },
    };

    render(<OAuth />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8000/api/users/me',
        {
          method: 'POST',
          headers: {
            Authorization: expect.stringMatching(/^Bearer /),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: 'Pilot', email: 'pilot@example.com' }),
        },
      );
      expect(window.electronAPI.setDatabaseMenuEnabled).toHaveBeenLastCalledWith(true);
    });
    expect(clerkMocks.getToken).toHaveBeenCalledWith({ template: 'photonflight' });
  });

  it('keeps the database menu disabled and reports a registration failure', async () => {
    clerkMocks.user = {
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_123',
        fullName: 'Pilot',
        username: 'pilot',
        primaryEmailAddress: { emailAddress: 'pilot@example.com' },
      },
    };
    fetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Database operation unavailable.' }),
    });

    render(<OAuth />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not connect your account to the database: Database operation unavailable.',
    );
    expect(window.electronAPI.setDatabaseMenuEnabled).toHaveBeenLastCalledWith(false);
  });

  it('opens the viewer in offline mode and clears guest state on sign-out', async () => {
    render(<OAuth />);

    fireEvent.click(screen.getByRole('button', { name: 'Offline Mode' }));
    expect(await screen.findByTestId('las-viewer')).toHaveTextContent('./CO_test1.laz');
    expect(useStore.getState().user).toBe('Guest');

    callbacks.signOut();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Offline Mode' })).toBeInTheDocument());
    expect(useStore.getState().user).toBeNull();
    expect(clerkMocks.signOut).not.toHaveBeenCalled();
  });

  it('shows settings when requested by the desktop API', () => {
    render(<OAuth />);

    act(() => callbacks.settings());

    expect(screen.getByTestId('settings-window')).toBeInTheDocument();
  });

  it('waits for Clerk to load before rendering', () => {
    clerkMocks.user = { isLoaded: false, isSignedIn: false, user: null };

    const { container } = render(<OAuth />);

    expect(container).toBeEmptyDOMElement();
  });
});
