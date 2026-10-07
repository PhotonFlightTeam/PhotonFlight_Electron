import { useState, useEffect, useRef } from 'react';
import { GizmoHelper, GizmoViewport } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import PointCloudViewer from './PointCloudViewer';
import MeasureTool from './MeasureTool';
import '../css/lasReader.css';
import * as THREE from 'three';
import useStore from '../useStore';
import Slider from '@mui/material/Slider';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import ViewControls from './ViewControls';


// Parent Wrapper providing the WebGL Viewport Context
export default function LasViewer({ fileUrl: initialFileUrl }) {
  const [active, setActive] = useState('base');
  const [key, setKey] = useState(0);
  const [fileSource, setFileSource] = useState(initialFileUrl);
  const [zoom, setZoom] = useState(180);
  const canvasRef = useRef();
  const pointsRef = useRef();

  useEffect(() => {
    if (!window.electronAPI) return;

    const offImport = window.electronAPI.onFileImported(async (filePath) => { // Import a .las file and load it into the viewer
      const buffer = await window.electronAPI.readFile(filePath);
      if (buffer) { 
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        setFileSource(arrayBuffer);
        useStore.setState({ colors: null, positions: null});
        setKey(prevKey => prevKey + 1); // Force re-render of PointCloud Viewer
      }
    });

    const offExport = window.electronAPI.onFileExported(async (filePath) => { // Export the current point cloud data to a .las file
      const { positions } = useStore.getState();
      if (!positions) return;

      const encodedLasData = new Uint8Array();
      await window.electronAPI.saveFile(filePath, encodedLasData);
    });

    return () => {
      offImport();
      offExport();
    };
  }, []); // Wtf even is this line dawg. Like Legit. 

  const handleChange = (event) => {
    setActive(event.target.value); 
    useStore.setState({ colors: null }); // Reset colors to trigger re-render
    setKey(prevKey => prevKey + 1); // Force re-render of PointCloudViewer
  };

  return (
    <div className="las-viewer">
      <Canvas 
      ref={canvasRef}
      camera={{ position: [0, 10, 50], fov: 60 }}>
        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} />
        
        <PointCloudViewer pointsRef={pointsRef} key={key} fileUrl={fileSource} active={active} />
        <MeasureTool pointsRef={pointsRef} />
        {/* <CanvasClickListener onClick={onClick} /> */}
        <ViewControls zoom={zoom} setZoom={setZoom} />

        <GizmoHelper alignment="bottom-left" margin={[80, 80]}>
          <GizmoViewport axisColors={['#ff3653', '#8adb00', '#2c8fff']} labelColor="white" />
        </GizmoHelper>
      </Canvas>

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
          onClick={() => setZoom(prev => Math.min(prev + 10, 200))}
          className="zoom-in">
          +
        </div>
        <Slider
          orientation="vertical"
          value={zoom}
          min={10}
          max={200}
          onChange={(event, newValue) => setZoom(newValue)}
          aria-label="Camera Zoom" />
        <div 
          onClick={() => setZoom(prev => Math.max(prev - 10, 10))}
          className="zoom-out">
          -
        </div>
      </Box>
    </div>
  );
}

