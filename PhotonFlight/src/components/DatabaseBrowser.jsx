import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/electron/react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

const API_URL = 'http://127.0.0.1:8000';
const CLERK_JWT_TEMPLATE = 'photonflight';
const PAGE_SIZE = 50;
const MAP_PAGE_SIZE = 100;

async function getResponseError(response, fallback) {
  const detail = await response.json().catch(() => null);
  return new Error(detail?.detail ?? `${fallback} (${response.status}).`);
}

export default function DatabaseBrowser({ currentFile, onLoadFile }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [maps, setMaps] = useState([]);
  const [selectedMapId, setSelectedMapId] = useState('');
  const [newMapName, setNewMapName] = useState('');
  const [showNewMapForm, setShowNewMapForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mapsLoading, setMapsLoading] = useState(false);
  const [creatingMap, setCreatingMap] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken({ template: CLERK_JWT_TEMPLATE });
    if (!token) {
      throw new Error('Clerk did not provide a session token.');
    }
    return { Authorization: `Bearer ${token}` };
  }, [getToken]);

  const loadFiles = useCallback(async (append = false) => {
    setLoading(true);
    setError(null);
    const requestOffset = append ? offset : 0;
    if (!append) {
      setFiles([]);
      setOffset(0);
      setHasMore(false);
    }
    try {
      const response = await fetch(
        `${API_URL}/api/lidar?limit=${PAGE_SIZE}&offset=${requestOffset}`,
        { headers: await getAuthHeaders() },
      );
      if (!response.ok) {
        throw await getResponseError(response, 'Could not load lidar files');
      }

      const result = await response.json();
      if (!Array.isArray(result)) {
        throw new Error('The lidar service returned an invalid response.');
      }
      setFiles((current) => append ? [...current, ...result] : result);
      setOffset(requestOffset + result.length);
      setHasMore(result.length === PAGE_SIZE);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders, offset]);

  const loadMaps = useCallback(async () => {
    setMapsLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const result = [];
      let mapOffset = 0;
      while (true) {
        const response = await fetch(
          `${API_URL}/api/maps?limit=${MAP_PAGE_SIZE}&offset=${mapOffset}`,
          { headers },
        );
        if (!response.ok) {
          throw await getResponseError(response, 'Could not load maps');
        }

        const page = await response.json();
        if (!Array.isArray(page)) {
          throw new Error('The map service returned an invalid response.');
        }
        result.push(...page);
        mapOffset += page.length;
        if (page.length < MAP_PAGE_SIZE) break;
      }

      setMaps(result);
      setSelectedMapId((current) => (
        result.some((map) => String(map.map_id) === String(current))
          ? current
          : String(result[0]?.map_id ?? '')
      ));
      if (result.length === 0) setShowNewMapForm(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setMapsLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (!window.electronAPI?.onOpenDatabaseBrowser) return undefined;

    return window.electronAPI.onOpenDatabaseBrowser(() => {
      setOpen(true);
      void loadFiles();
      void loadMaps();
    });
  }, [loadFiles, loadMaps]);

  const createMap = async (event) => {
    event.preventDefault();
    const name = newMapName.trim();
    if (!name) return;

    setCreatingMap(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/maps`, {
        method: 'POST',
        headers: {
          ...(await getAuthHeaders()),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw await getResponseError(response, 'Could not create map');
      }

      const map = await response.json();
      setMaps((current) => [...current, map]);
      setSelectedMapId(String(map.map_id));
      setNewMapName('');
      setShowNewMapForm(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : String(createError));
    } finally {
      setCreatingMap(false);
    }
  };

  const uploadCurrentFile = async () => {
    if (!currentFile?.bytes || !selectedMapId) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('map_id', selectedMapId);
      formData.append(
        'file',
        new Blob([currentFile.bytes]),
        currentFile.name,
      );

      const response = await fetch(`${API_URL}/api/lidar/upload`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: formData,
      });
      if (!response.ok) {
        throw await getResponseError(response, 'Could not upload lidar file');
      }

      await loadFiles();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : String(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const loadDatabaseFile = async (file) => {
    setDownloadingId(file.lidar_id);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/api/lidar/${file.lidar_id}/file`,
        { headers: await getAuthHeaders() },
      );
      if (!response.ok) {
        throw await getResponseError(response, 'Could not download lidar file');
      }
      if (typeof onLoadFile !== 'function') {
        throw new Error('The lidar viewer is not available to load this file.');
      }

      onLoadFile(await response.arrayBuffer());
      setOpen(false);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    } finally {
      setDownloadingId(null);
    }
  };

  const mapName = (mapId) => (
    maps.find((map) => String(map.map_id) === String(mapId))?.name
      ?? `Map ${mapId}`
  );

  return (
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Lidar Database</DialogTitle>
      <DialogContent dividers>
        {(loading || mapsLoading) && <CircularProgress aria-label="Loading database" />}
        {error && <Alert severity="error">{error}</Alert>}

        <Typography variant="subtitle1" sx={{ mt: 1 }}>
          Upload current file
        </Typography>
        {currentFile ? (
          <Typography variant="body2">{currentFile.name}</Typography>
        ) : (
          <Typography variant="body2">Import a LAS/LAZ file before uploading.</Typography>
        )}

        {maps.length > 0 && (
          <FormControl fullWidth margin="normal" disabled={mapsLoading}>
            <InputLabel id="lidar-map-label">Map</InputLabel>
            <Select
              labelId="lidar-map-label"
              id="lidar-map"
              value={selectedMapId}
              label="Map"
              onChange={(event) => setSelectedMapId(event.target.value)}
            >
              {maps.map((map) => (
                <MenuItem key={map.map_id} value={String(map.map_id)}>
                  {map.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {maps.length === 0 && !mapsLoading && (
          <Typography variant="body2">
            Create a map to associate with this lidar file.
          </Typography>
        )}

        {!showNewMapForm ? (
          <Button onClick={() => setShowNewMapForm(true)}>
            Create new map
          </Button>
        ) : (
          <form onSubmit={createMap}>
            <TextField
              fullWidth
              margin="normal"
              label="New map name"
              value={newMapName}
              onChange={(event) => setNewMapName(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 150 } }}
              required
            />
            <Button type="submit" disabled={creatingMap || !newMapName.trim()}>
              {creatingMap ? 'Creating map…' : 'Save map'}
            </Button>
            {maps.length > 0 && (
              <Button onClick={() => setShowNewMapForm(false)} disabled={creatingMap}>
                Cancel
              </Button>
            )}
          </form>
        )}
        <Button
          onClick={() => void uploadCurrentFile()}
          disabled={!currentFile?.bytes || !selectedMapId || uploading || loading}
        >
          {uploading ? 'Uploading…' : 'Upload current file'}
        </Button>

        <Typography variant="subtitle1" sx={{ mt: 2 }}>
          Available lidar files
        </Typography>
        {!loading && files.length === 0 && (
          <Typography>No lidar files are associated with your account.</Typography>
        )}
        {files.length > 0 && (
          <List aria-label="Available lidar files">
            {files.map((file) => (
              <ListItem key={file.lidar_id} divider>
                <ListItemText
                  primary={file.file_location?.split(/[\\/]/).pop() || `Lidar file ${file.lidar_id}`}
                  secondary={[
                    file.file_format,
                    file.map_id ? `Map: ${mapName(file.map_id)}` : null,
                    file.uploaded_at ? `Uploaded: ${new Date(file.uploaded_at).toLocaleString()}` : null,
                  ].filter(Boolean).join(' · ')}
                />
                <Button
                  onClick={() => void loadDatabaseFile(file)}
                  disabled={!file.file_size_bytes || downloadingId !== null}
                >
                  {downloadingId === file.lidar_id ? 'Loading…' : 'Load'}
                </Button>
              </ListItem>
            ))}
          </List>
        )}
        {hasMore && (
          <Button disabled={loading} onClick={() => void loadFiles(true)}>
            Load more
          </Button>
        )}
      </DialogContent>
      <DialogActions>
        {error && (
          <Button
            onClick={() => {
              void loadFiles();
              void loadMaps();
            }}
          >
            Retry
          </Button>
        )}
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
