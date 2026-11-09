import { useEffect, useState } from 'react';
import { SignInButton, useAuth, useUser, useClerk } from '@clerk/electron/react';
import LasViewer from './lasReader.jsx';
import useStore from '../useStore';
import Button from '@mui/material/Button';
import '../css/OAuth.css';

const API_URL = 'http://127.0.0.1:8000';
const CLERK_JWT_TEMPLATE = 'photonflight';

export default function OAuth() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { getToken } = useAuth();
    const { signOut } = useClerk();
    const [name, setName] = useState(null);
    const [provisionError, setProvisionError] = useState(null);
    const min = useStore(state => state.min);
    const max = useStore(state => state.max);

    useEffect(() => {
        const displayName = user?.fullName
            ?? user?.primaryEmailAddress?.emailAddress
            ?? null;
        const email = user?.primaryEmailAddress?.emailAddress;

        setName(displayName);
        useStore.setState({
            user: isSignedIn ? displayName : null,
            username: isSignedIn ? user?.username : null,
            id: isSignedIn ? user?.id : null,
        });

        if (!isSignedIn || !user?.id) {
            setProvisionError(null);
            window.electronAPI?.setDatabaseMenuEnabled?.(false);
            return undefined;
        }

        let isCurrent = true;
        setProvisionError(null);
        window.electronAPI?.setDatabaseMenuEnabled?.(true);

        const registerUser = async () => {
            try {
                if (!displayName || !email) {
                    throw new Error('Your Clerk account must have a name and primary email address.');
                }

                const token = await getToken({ template: CLERK_JWT_TEMPLATE });
                if (!token) {
                    throw new Error('Clerk did not provide a session token.');
                }

                const response = await fetch(`${API_URL}/api/users/me`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: displayName, email }),
                });
                if (!response.ok) {
                    const detail = await response.json().catch(() => null);
                    throw new Error(detail?.detail ?? `Could not register the user (${response.status}).`);
                }

            } catch (error) {
                if (isCurrent) {
                    setProvisionError(error instanceof Error ? error.message : String(error));
                }
            }
        };

        void registerUser();
        return () => {
            isCurrent = false;
        };
    }, [getToken, isSignedIn, user]);

    useEffect(() => {
        return window.electronAPI.onSignOutRequested(() => {
            if (name !== 'Guest') {
                void signOut().catch(console.error);
                useStore.setState({
                    user: null,
                    username: null, 
                    id: null,
                });
                window.electronAPI?.setDatabaseMenuEnabled?.(false);
            }
            else {
                setName(null);
                useStore.setState({
                    user: null,
                    username: null,
                    id: null,
                });
                window.electronAPI?.setDatabaseMenuEnabled?.(false);
            }
        });
    }, [name, signOut]);

    const guestClick = () => {
        setName('Guest');
        useStore.setState({
            user: 'Guest',
            username: 'Guest',
            id: null,
        })
        window.electronAPI?.setDatabaseMenuEnabled?.(false);
    }

    if (!isLoaded) return null;
    if (name) {
        return (
            <>
                {provisionError && (
                    <div role="alert">
                        Could not connect your account to the database: {provisionError}
                    </div>
                )}
                <LasViewer />
            </>
        );
    }

    const toCssRgb = (color) => color
        ? color.map(value => Math.round(Math.max(0, Math.min(1, value)) * 255)).join(', ')
        : '255, 255, 255';

    return (
        <main
            className="oauth-page"
            style={{
                '--oauth-min-color': toCssRgb(min),
                '--oauth-max-color': toCssRgb(max),
            }}>
            <section className="oauth-card">
                <h1>Photon Flight</h1>
                <div className="oauth-actions">
                    <SignInButton mode="modal">
                        <Button variant="contained" type="button">Sign In</Button>
                    </SignInButton>
                    <Button variant="outlined" type="button" onClick={guestClick}>
                        Offline Mode
                    </Button>
                </div>
            </section>
        </main>
    )
}