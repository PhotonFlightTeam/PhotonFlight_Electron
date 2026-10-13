import { MapPin } from 'lucide-react';
import useStore from '../useStore';
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import React from 'react';
import { Html } from '@react-three/drei';

export default function PinTool({ pointsRef, activeTool }) {
    // Get camera and WebGL from Three.js state
    const { camera, gl } = useThree();
    // Pinpoints is 3D points, segments stores the line data
    const [pinPoints, setPinPoints] = useState([]);

    const onClick = (event, canvas, camera) => {
        if (activeTool !== 'Pin') return; // Ensure tool is active
        
        // Find the mouse position relative to the canvas
        const rect = canvas.getBoundingClientRect();

        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / canvas.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / canvas.clientHeight) * 2 + 1;

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        raycaster.params.Points.threshold = 0.5; // Adjust based on your point size/scene scale

        // Intersect the ray with the points in the scene
        const intersects = raycaster.intersectObject(pointsRef.current);
        const points = useStore.getState().positions;

        if (intersects.length > 0) {
            // Get index of the closest point to the mouse position
            const index = intersects[0].index * 3;

            // Add the point to the array of pinpoints in the store
            let measures = useStore.getState().pinpoints ? useStore.getState().pinpoints : [];
            measures.push(points[index]);
            measures.push(points[index + 1]);
            measures.push(points[index + 2]);

            // Update the store with the new members
            useStore.setState({ pinpoints: measures });

            // Convert the flat array to an array of 3D vectors
            measures = Array.from(
                { length: Math.ceil(measures.length / 3) },
                (_, index) => new THREE.Vector3(
                    measures[index * 3],
                    measures[index * 3 + 1],
                    measures[index * 3 + 2]
                )
            );

            // Update the local state with the new pin points
            setPinPoints(measures);
            
        }
    };


    const onKeyDown = (event) => {
        if (activeTool !== 'Pin') return; // Ensure tool is active
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        // Clear all pinpoints when 'd' is pressed
        if (event.key.toLowerCase() === 'd') {
            setPinPoints([]);
            useStore.setState({ pinpoints: [] });
        }
    }

    useEffect(() => {
        // Add event listeners for click and keydown events
        const canvas = gl.domElement;
        const handleClick = (event) => onClick(event, canvas, camera);
        const handleKeyDown = (event) => onKeyDown(event);
      
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('keydown', handleKeyDown);

        return () => {
            canvas.removeEventListener('click', handleClick);
            canvas.removeEventListener('keydown', handleKeyDown);
        };
    }, [camera, gl, onClick]);


    return(
        <>
            {pinPoints.map((point, index) => (
                <React.Fragment key={index}>
                    <mesh position={point}>
                        <sphereGeometry args={[0.5, 16, 16]} />
                        <meshStandardMaterial color="red" />
                    </mesh>
                    <Html position={point} center>
                        <MapPin color="red" size={20} />
                    </Html>
                </React.Fragment>
            ))}
        </>
    );
}