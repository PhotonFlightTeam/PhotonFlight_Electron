import { useEffect, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function ViewControls({ zoom, setZoom }) {
  const { camera, gl } = useThree();
  const controlsRef = useRef();
  const isUpdatingFromSlider = useRef(false);
  const [axis, setAxis] = useState(null);

  const maxDist = 1000; // Maximum distance from camera to target
  const minDist = 1;  // Minimum distance from camera to target
  // Slider Min/Max
  const maxZoom = 200; // Slider top value
  const minZoom = 10;  // Slider bottom value

  // Helper math to map physical distance to a 10-200 slider value
  const distToZoom = (dist) => maxZoom - (((Math.max(minDist, Math.min(dist, maxDist)) - minDist) / (maxDist - minDist)) * (maxZoom - minZoom));
  const zoomToDist = (z) => minDist + (((maxZoom - Math.max(minZoom, Math.min(z, maxZoom))) / (maxZoom - minZoom)) * (maxDist - minDist));

  // Sync Slider to Mouse Wheel (OrbitControls internal change)
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const onControlChange = () => {
      if (isUpdatingFromSlider.current) return;

      const dist = camera.position.distanceTo(controls.target);
      setZoom(() => distToZoom(dist));
    };

    controls.addEventListener('change', onControlChange);
    return () => controls.removeEventListener('change', onControlChange);
  }, [camera, setZoom]);
  
  //Sync Slider Camera
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const currentDist = camera.position.distanceTo(controls.target);
    const targetDist = zoomToDist(zoom);
    
    // Only move the camera if the slider value differs significantly from current view
    if (Math.abs(currentDist - targetDist) > 0.5) {
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      if (direction.lengthSq() === 0) direction.set(0, 0, 1);

      isUpdatingFromSlider.current = true;

      camera.position.copy(controls.target).add(direction.multiplyScalar(targetDist));
      controls.update();

      isUpdatingFromSlider.current = false;
    }
  }, [zoom, camera]);
  

  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas) return;
    canvas.tabIndex = 0;
    const focus = () => canvas.focus();

    const applyView = (pos, dir) => {
      controlsRef.current.target.set(0, 0, 0);
      camera.position.set(pos[0], pos[1], pos[2]);
      camera.up.set(dir[0], dir[1], dir[2]);
      controlsRef.current.update();
      // Update the slider to match the new perspective's distance
      setZoom(distToZoom(camera.position.distanceTo(controlsRef.current.target)));
    };

    const shift = (pos) => {
      console.log(pos);
      camera.position.x += pos[0];
      camera.position.y += pos[1];
      camera.position.z += pos[2];
    };

    const rotate = (dir) => {
      controlsRef.current.target.x += dir[0];
      controlsRef.current.target.y += dir[1];
      controlsRef.current.target.z += dir[2];
    };

    const handleKeyDown = (event) => {
      console.log(event.key);
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

      switch (event.key.toLowerCase()) {
        case 't': applyView([0, 0, 500], [0, 1, 0]); break;
        case 'b': applyView([0, 0, -500], [0, -1, 0]); break;
        case 'f': applyView([500, 0, 0], [0, 0, 1]); break;
        case 'v': applyView([-500, 0, 0], [0, 0, 1]); break;
        case 'l': applyView([0, -500, 0], [0, 0, 1]); break;
        case 'r': applyView([0, 500, 0], [0, 0, 1]); break;
        case 'x': if (axis === null) setAxis([10,0,0]); break;
        case 'y': if (axis === null) setAxis([0,10,0]); break;
        case 'z': if (axis === null) setAxis([0,0,10]); break;
        case 'arrowup': if (axis !== null) shift(axis); break;
        case 'arrowdown': if (axis !== null) shift(axis.map(num => -1 * num)); break;
        case 'arrowright': if (axis !== null) rotate(axis); break;
        case 'arrowleft': if (axis !== null) rotate(axis.map(num => -1 * num)); break;
        case ' ': 
          event.preventDefault(); 
          applyView([0, 0, 50], [0, 1, 0]); 
          break;
      }
    };

    const handleKeyUp = (event) => {
      if (['x', 'y', 'z'].includes(event.key.toLowerCase())) {
        setAxis(null);
      }
    };

    canvas.addEventListener('click', focus);
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);

    return () => {
      canvas.removeEventListener('click', focus);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
    };
  }, [gl, camera, axis]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping maxDistance={maxDist} minDistance={minDist}/>;
}