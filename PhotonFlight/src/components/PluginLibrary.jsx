import { useState, useEffect, useCallback } from 'react';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import '../css/pluginLibrary.css';

// Plugin icon: falls back to the first letter of the name when there's no image
export const PluginIcon = ({ plugin, className }) => (
    <Avatar className={className} src={plugin.icon ?? undefined} alt={plugin.name}>
        {plugin.name.charAt(0).toUpperCase()}
    </Avatar>
);

// Electron prefixes errors thrown in main with "Error invoking remote method ..."
const cleanError = (err) =>
    err.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');

// Installed plugins + actions. Shared by the side panel and the details panel.
export function usePlugins() {
    const [plugins, setPlugins] = useState([]);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!window.electronAPI) return;
        setPlugins(await window.electronAPI.listPlugins());
    }, []);

    // Load once, then reload whenever main says plugins changed (Plugins > Import...)
    useEffect(() => {
        refresh();
        if (!window.electronAPI) return;
        return window.electronAPI.onPluginsChanged(refresh);
    }, [refresh]);

    // Runs a plugin action, shows any error, then refreshes the list
    const run = async (action) => {
        try {
            setError(null);
            return await action();
        } catch (err) {
            setError(cleanError(err));
        } finally {
            await refresh();
        }
    };

    return {
        plugins,
        error,
        importPlugin: () => run(() => window.electronAPI.importPlugin()),
        removePlugin: (id) => run(() => window.electronAPI.removePlugin(id)),
        setPluginEnabled: (id, enabled) => run(() => window.electronAPI.setPluginEnabled(id, enabled)),
    };
}

export function PluginSidebar({ plugins, selectedId, onSelect, onClose, onImport, error }) {
    const [search, setSearch] = useState('');
    const [addMenuAnchor, setAddMenuAnchor] = useState(null);

    const query = search.trim().toLowerCase();
    const filtered = plugins.filter(p =>
        [p.name, p.author, p.description].some(field => field.toLowerCase().includes(query))
    );

    const handleAddFromDevice = () => {
        setAddMenuAnchor(null);
        onImport();
    };

    return (
        <aside className="plugin-sidebar">
            <div className="plugin-sidebar-header">
                <span>PLUGINS</span>
                <IconButton size="small" onClick={onClose} aria-label="Close plugins panel">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </div>

            <div className="plugin-sidebar-search">
                <TextField
                    size="small"
                    placeholder="Search plugins..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    fullWidth />
            </div>

            {error && <div className="plugin-error">{error}</div>}

            <div className="plugin-list">
                {filtered.length === 0 && (
                    <div className="plugin-empty">
                        {plugins.length === 0 ? 'No plugins installed.' : 'No matches.'}
                    </div>
                )}

                {filtered.map(plugin => (
                    <div
                        key={plugin.id}
                        className={`plugin-card ${plugin.id === selectedId ? 'selected' : ''} ${plugin.enabled ? '' : 'disabled'}`}
                        onClick={() => onSelect(plugin.id)}>
                        <PluginIcon plugin={plugin} className="plugin-icon-small" />
                        <div className="plugin-card-text">
                            <div className="plugin-card-name">{plugin.name}</div>
                            <div className="plugin-card-desc">{plugin.description}</div>
                            <div className="plugin-card-author">
                                {plugin.author}
                                {!plugin.enabled && <span className="plugin-card-badge"> · Disabled</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="plugin-sidebar-footer">
                <Button variant="outlined" fullWidth onClick={e => setAddMenuAnchor(e.currentTarget)}>
                    + Add Plugin...
                </Button>
                <Menu
                    anchorEl={addMenuAnchor}
                    open={!!addMenuAnchor}
                    onClose={() => setAddMenuAnchor(null)}>
                    <MenuItem onClick={handleAddFromDevice}>From Device</MenuItem>
                    <MenuItem disabled>From Market (coming soon)</MenuItem>
                </Menu>
            </div>
        </aside>
    );
}

export function PluginDetails({ plugin, onClose, onToggle, onRemove, error }) {
    const handleRemove = () => {
        if (window.confirm(`Uninstall "${plugin.name}"?`)) onRemove(plugin.id);
    };

    return (
        <section className="plugin-details">
            <IconButton className="plugin-details-close" onClick={onClose} aria-label="Close plugin details">
                <CloseIcon />
            </IconButton>

            {error && <div className="plugin-error">{error}</div>}

            <div className="plugin-details-header">
                <PluginIcon plugin={plugin} className="plugin-icon-large" />
                <div>
                    <div className="plugin-details-name">
                        {plugin.name}
                        {plugin.version && <span className="plugin-version">v{plugin.version}</span>}
                    </div>
                    <div className="plugin-details-author">{plugin.author}</div>
                    <div className="plugin-details-actions">
                        <Button
                            size="small"
                            variant={plugin.enabled ? 'outlined' : 'contained'}
                            onClick={() => onToggle(plugin.id, !plugin.enabled)}>
                            {plugin.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button size="small" variant="outlined" color="error" onClick={handleRemove}>
                            Uninstall
                        </Button>
                    </div>
                </div>
            </div>

            <h3>Description</h3>
            <p>{plugin.description || 'No description provided.'}</p>

            <h3>Documentation</h3>
            {plugin.documentation.length > 0 ? (
                <ul>
                    {plugin.documentation.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
            ) : (
                <p>No documentation provided.</p>
            )}
        </section>
    );
}