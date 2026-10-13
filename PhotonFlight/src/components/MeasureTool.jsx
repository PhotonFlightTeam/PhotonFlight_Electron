import { Line, Billboard, Text } from '@react-three/drei';
import useStore from '../useStore';
import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function MeasureTool({ pointsRef, activeTool }) {
    // Get camera and WebGL from Three.js state
    const { camera, gl } = useThree();
    // Measures is 3D points, segments stores the line data
    const [measurePoints, setMeasurePoints] = useState([]);
    const [segments, setSegments] = useState([]);

    const onClick = (event, canvas, camera) => {
        if (activeTool !== 'Measure') return; // Ensure tool is active
        
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

            // Add the point to the array of measures in the store
            let measures = useStore.getState().measures ? useStore.getState().measures : [];
            measures.push(points[index]);
            measures.push(points[index + 1]);
            measures.push(points[index + 2]);

            // Update the store with the new members
            useStore.setState({ measures: measures });

            // Convert the flat array to an array of 3D vectors
            measures = Array.from(
                { length: Math.ceil(measures.length / 3) },
                (_, index) => new THREE.Vector3(
                    measures[index * 3],
                    measures[index * 3 + 1],
                    measures[index * 3 + 2]
                )
            );

            // Update the local state with the new measure points
            setMeasurePoints(measures);

            // Update the segments for rendering the lines and lengths
            setSegments(measures.slice(1).map((end, index) => {
                const start = measures[index];

                // index is used as a key
                // midpoint is the average of start and end points
                // length is the distance between start and end points
                return {
                    index: index,
                    midpoint: start.clone().add(end).multiplyScalar(0.5),
                    length: start.distanceTo(end),
                }
            }));
            
        }
    };

    const onKeyDown = (event) => {
        if (activeTool !== 'Measure') return; // Ensure tool is active
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        if (event.key.toLowerCase() === 'd') {
            // Remove the last three points (the last measure) from the store
            let measures = useStore.getState().measures;
            measures.pop();
            measures.pop();
            measures.pop();
            useStore.setState({ measures: measures });

            // Convert the flat array to an array of 3D vectors
            measures = Array.from(
                { length: Math.ceil(measures.length / 3) },
                (_, index) => new THREE.Vector3(
                    measures[index * 3],
                    measures[index * 3 + 1],
                    measures[index * 3 + 2]
                )
            );

            // Update the local state with the new measure points
            setMeasurePoints(measures);

            //  Update the segments for rendering the lines and lengths
            setSegments(measures.slice(1).map((end, index) => {
                const start = measures[index];

                // index is used as a key
                // midpoint is the average of start and end points
                // length is the distance between start and end points
                return {
                    index: index,
                    midpoint: start.clone().add(end).multiplyScalar(0.5),
                    length: start.distanceTo(end),
                }
            }));
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
            
            {measurePoints.length >= 2 && (
                <Line points={measurePoints} color="red" lineWidth={1} />
            )}
            
            {/* Preloads set of characters so there isn't delay when first
                text is made.*/}
            <Text
                visible={false}
            >
                0123456789.
            </Text>

            {segments.map(({ index, midpoint, length }) => (
                <Billboard key={index} position={midpoint}>
                    <Text
                        fontSize={3}
                        color="red"
                        anchorX="center"
                        anchorY="middle"
                    >
                        {length.toFixed(2)}
                    </Text>
                </Billboard>
                
            ))}
        </>
    );
}