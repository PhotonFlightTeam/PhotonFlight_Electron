import { useEffect, useState } from 'react';
import { SignInButton, useUser, useClerk } from '@clerk/electron/react';
import LasViewer from './lasReader.jsx';
import useStore from '../useStore';

export default function OAuth() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { signOut } = useClerk();
    const [name, setName] = useState(null);

    useEffect(() => {
        setName(user?.fullName
            ?? user?.primaryEmailAddress?.emailAddress
            ?? null);

        console.log('User signed in:', name);
        useStore.setState({
            user: isSignedIn ? name : null,
        });
    }, [isSignedIn, user]);

    useEffect(() => {
        return window.electronAPI.onSignOutRequested(() => {
            if (name !== 'Guest') {
                void signOut().catch(console.error);
                useStore.setState({
                    user: null,
                });
            }
            else {
                setName(null);
                useStore.setState({
                    user: null,
                });
            }
        });
    }, [name, signOut]);

    const guestClick = () => {
        setName('Guest');
        useStore.setState({
            user: 'Guest',
        })
    }

    if (!isLoaded) return null;
    if (name) return <LasViewer fileUrl="./CO_test1.laz" />;

    return (
        <>
            <SignInButton mode="modal">
                <button type="button">Sign In</button>
            </SignInButton>
            <button type="button" onClick={guestClick}>
                Offline Mode
            </button>
        </>
        

    )
}