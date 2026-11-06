import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/electron/react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';

const API_URL = 'http://127.0.0.1:8000';
const CLERK_JWT_TEMPLATE = 'photonflight';
const PAGE_SIZE = 50;

export default function DatabaseBrowser() {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

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
      const token = await getToken({ template: CLERK_JWT_TEMPLATE });
      if (!token) {
        throw new Error('Clerk did not provide a session token.');
      }

      const response = await fetch(
        `${API_URL}/api/lidar?limit=${PAGE_SIZE}&offset=${requestOffset}`,
        {
        headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.detail ?? `Could not load lidar files (${response.status}).`);
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
  }, [getToken, offset]);

  useEffect(() => {
    if (!window.electronAPI?.onOpenDatabaseBrowser) return undefined;

    return window.electronAPI.onOpenDatabaseBrowser(() => {
      setOpen(true);
      void loadFiles();
    });
  }, [loadFiles]);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Lidar Database</DialogTitle>
      <DialogContent dividers>
        {loading && <CircularProgress aria-label="Loading lidar files" />}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !error && files.length === 0 && (
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
                    file.map_name ? `Map: ${file.map_name}` : null,
                    file.uploaded_at ? `Uploaded: ${new Date(file.uploaded_at).toLocaleString()}` : null,
                  ].filter(Boolean).join(' · ')}
                />
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
        {error && <Button onClick={() => void loadFiles(files.length > 0)}>Retry</Button>}
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
