import { useEffect, useState } from 'react';
import { SignInButton, useUser, useClerk } from '@clerk/electron/react';
import LasViewer from './lasReader.jsx';
import useStore from '../useStore';
import '../css/OAuth.css';

export default function OAuth() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { signOut } = useClerk();
    const [name, setName] = useState(null);
    const min = useStore(state => state.min);
    const max = useStore(state => state.max);

    useEffect(() => {
        setName(user?.fullName
            ?? user?.primaryEmailAddress?.emailAddress
            ?? null);

        console.log('User signed in:', name);
        useStore.setState({
            user: isSignedIn ? name : null,
            username: isSignedIn ? user?.username : null,
            id: isSignedIn ? user?.id : null,
        });
    }, [isSignedIn, user]);

    useEffect(() => {
        return window.electronAPI.onSignOutRequested(() => {
            if (name !== 'Guest') {
                void signOut().catch(console.error);
                useStore.setState({
                    user: null,
                    username: null, 
                    id: null,
                });
            }
            else {
                setName(null);
                useStore.setState({
                    user: null,
                    username: null,
                    id: null,
                });
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
    }

    if (!isLoaded) return null;
    if (name) return <LasViewer />;

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
                        <button type="button">Sign In</button>
                    </SignInButton>
                    <button type="button" onClick={guestClick}>
                        Offline Mode
                    </button>
                </div>
            </section>
        </main>
    )
}