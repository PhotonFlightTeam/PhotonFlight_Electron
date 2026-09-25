import * as THREE from 'three';
import useStore from '../useStore';


export function colorSquare(
  geo: THREE.BufferGeometry,
  position: [number, number, number],
  width: number,
  height: number,
  rgbValue: [number, number, number]
): void {
      let colors = useStore.getState().colors;
      const positions = useStore.getState().positions;
      
      if (!positions || !colors) return;
      
      let xDif = 0;
      let yDif = 0;
      for (let i = 0; i < positions.length; i += 3) { 
        xDif = Math.abs(positions[i] - position[0]);
        yDif = Math.abs(positions[i + 1] - position[1]);
        
        
        if (xDif < width && yDif < height) {
          colors[i] = rgbValue[0];
          colors[i + 1] = rgbValue[1];
          colors[i + 2] = rgbValue[2];
        }
      }

      useStore.setState({ colors: colors }); // Store the generated colors in Zustand state
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }