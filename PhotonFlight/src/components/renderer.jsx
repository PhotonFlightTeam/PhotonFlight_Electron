import { createRoot } from 'react-dom/client';
import OAuth from './OAuth.jsx';
import React from 'react';
import { ClerkProvider } from '@clerk/electron/react';
import { PointCloudThemeProvider } from '../theme/pointCloudTheme';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY');
}

const root = createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <ClerkProvider publishableKey={publishableKey}>
            <PointCloudThemeProvider>
                <OAuth />
            </PointCloudThemeProvider>
        </ClerkProvider>
    </React.StrictMode>
);