import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import PointCloudViewer from './PointCloudViewer';
import MeasureTool from './MeasureTool';
import '../css/lasReader.css';
import useStore from '../useStore';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ExtensionIcon from '@mui/icons-material/Extension';
import ViewControls from './ViewControls';
import { usePlugins, PluginSidebar, PluginDetails } from './PluginLibrary';
import ToolBar from './ToolBar';
import PinTool from './Pin';
import { usePointCloudTheme } from '../theme/pointCloudTheme';
import DatabaseBrowser from './DatabaseBrowser';
import { exportPointCloud } from './lasExport';

// Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl: initialFileUrl }) {
  const { mode } = usePointCloudTheme();
  const [active, setActive] = useState('base');
  const [key, setKey] = useState(0);
  const [fileSource, setFileSource] = useState(initialFileUrl);
  const [currentFile, setCurrentFile] = useState(null);
  const [zoom, setZoom] = useState(180);
  const [zoomRequest, setZoomRequest] = useState({ value: 180 });
  const [activeTool, setActiveTool] = useState('Select');
  const pointsRef = useRef(); // The <points> object. MeasureTool and PinTool raycast against it. Empty until mount, like my will to debug this 
  const fileSourceRef = useRef(initialFileUrl); // The export listener was born on the first render and never left. Reminds me of how she was "reborn" and then left me immediately.
  fileSourceRef.current = fileSource;

  // Plugin library 
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedPluginId, setSelectedPluginId] = useState(null);
  const pluginManager = usePlugins();
  
  // Becomes undefined after uninstall, should close the details panel automatically
  // TODO: This should be handled in the PluginSidebar, not here, but we can keep it here for now
  const selectedPlugin = pluginManager.plugins.find(p => p.id === selectedPluginId);

  const handleZoomRequest = (value) => {
    setZoom(value);
    setZoomRequest({ value });
  };

  const handleImportPlugin = async () => {
    const id = await pluginManager.importPlugin();
    if (id) setSelectedPluginId(id);
  };

  useEffect(() => {
    if (!window.electronAPI) return;

    const offImport = window.electronAPI.onFileImported(async (filePath) => { // Import a .las file and load it into the viewer
      const buffer = await window.electronAPI.readFile(filePath);
      if (buffer) {
        const bytes = new Uint8Array(buffer);
        const arrayBuffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        );
        setFileSource(arrayBuffer);
        setCurrentFile({
          name: filePath.split(/[\\/]/).pop(),
          bytes,
        });
        useStore.setState({ colors: null, positions: null, measures: null, pinpoints: null });
      }
    });
    // Export a .las file from the viewer. Writes it to disk. TODO: Need to support .laz export, but the LASzip encoder is a pain to compile for Node. Maybe later. 
    // For now, just export as .las. The viewer will convert the point cloud to 32-bit coords and write it as uncompressed LAS.
    const offExport = window.electronAPI.onFileExported(async (filePath) => {
      try {
        if (!fileSourceRef.current) throw new Error('Load a point cloud before exporting.');
        const bytes = await exportPointCloud(fileSourceRef.current, filePath);
        const saved = await window.electronAPI.saveFile(filePath, bytes);
        if (!saved) throw new Error('The file could not be written. Check the terminal for details.');
      } catch (error) {
        window.alert(`Export failed: ${error.message}`);
      }
    });
    
    // Plugins > Library menu opens side panel
    const offPluginLibrary = window.electronAPI.onOpenPluginLibrary(() => setLibraryOpen(true));

    return () => {
      offImport();
      offExport();
      offPluginLibrary();
    };
  }, []);

  const loadDatabaseFile = (arrayBuffer) => {
    setFileSource(arrayBuffer);
    setCurrentFile(null);
    useStore.setState({ colors: null, positions: null, measures: null, pinpoints: null });
  };

  const handleChange = (event) => {
    setActive(event.target.value); 
    useStore.setState({ colors: null }); // Reset colors to trigger re-render
    setKey(prevKey => prevKey + 1);
  };

    return (
    <div className="las-viewer" data-theme={mode}>
      <DatabaseBrowser
        currentFile={currentFile}
        onLoadFile={loadDatabaseFile}
      />

      <nav className="activity-bar">
        <Tooltip title="Plugins" placement="right">
          <IconButton
            className={libraryOpen ? 'active' : ''}
            onClick={() => setLibraryOpen(open => !open)}
            aria-label="Plugins">
            <ExtensionIcon />
          </IconButton>
        </Tooltip>
      </nav>

      {libraryOpen && (
        <PluginSidebar
          plugins={pluginManager.plugins}
          selectedId={selectedPluginId}
          onSelect={setSelectedPluginId}
          onClose={() => setLibraryOpen(false)}
          onImport={handleImportPlugin}
          error={pluginManager.error} />
      )}

      <div className="viewer-area">
        <Canvas 
        camera={{ position: [0, 10, 50], fov: 60 }}
        gl={{ alpha: true, antialias: true }}
        key={key}>
          <ambientLight intensity={1.5} />
          <pointLight position={[10, 10, 10]} />
          
          <PointCloudViewer pointsRef={pointsRef} fileUrl={fileSource} active={active} />
          <MeasureTool pointsRef={pointsRef} activeTool={activeTool} fileUrl={fileSource} />
          <PinTool pointsRef={pointsRef} activeTool={activeTool} fileUrl={fileSource} />
          <ViewControls zoomRequest={zoomRequest} setZoom={setZoom} />
        </Canvas>

        <div className="tool-bar">
          <ToolBar activeTool={activeTool} setActiveTool={setActiveTool} />
        </div>

        <Box className="view-color-box">
          <FormControl fullWidth>
            <InputLabel id="View Color Selection">View Color</InputLabel>
            
            <Select
              labelId="View Label"
              id="View Selection"
              value={active}
              label="View Color"
              onChange={handleChange}>

              <MenuItem value={'base'}>Base</MenuItem>
              <MenuItem value={'height'}>Height</MenuItem>
              <MenuItem value={'slope'}>Slope</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box className="zoom-box">
          <div 
            onClick={() => handleZoomRequest(Math.min(zoom + 10, 200))}
            className="zoom-in">
            +
          </div>
          <Slider
            orientation="vertical"
            value={zoom}
            min={10}
            max={200}
            onChange={(event, newValue) => handleZoomRequest(newValue)}
            aria-label="Camera Zoom" />
          <div 
            onClick={() => handleZoomRequest(Math.max(zoom - 10, 10))}
            className="zoom-out">
            -
          </div>
        </Box>

        {selectedPlugin && (
          <PluginDetails
            plugin={selectedPlugin}
            onClose={() => setSelectedPluginId(null)}
            onToggle={pluginManager.setPluginEnabled}
            onRemove={pluginManager.removePlugin}
            error={pluginManager.error} />
        )}
      </div>
    </div>
  );
}