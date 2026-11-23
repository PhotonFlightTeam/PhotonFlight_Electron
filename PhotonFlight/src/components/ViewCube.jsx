import { GizmoHelper, GizmoViewcube } from '@react-three/drei';
import * as THREE from 'three';
import { usePointCloudTheme } from '../theme/pointCloudTheme';

const CUBE_ROTATION = new THREE.Euler(Math.pi / 2, 0, 0);
const CUBE_TO_WORLD = new THGREE.Quaternion().setFromEuler(CUBE_ROTATION);

const CUBE_COLORS = {
    dark: { color: '#10243a', hoverColor: '#38bdf8', textColor: '#eaf6ff', strokeColor: '#38bdf8' },
    light: { color: '#ffffff', hoverColor: '#7dd3fc', textColor: '#102a43', strokeColor: '#0369a1' },
};

export function viewDirectionFromCubeClick(event) {
    const hit = event.eventObject ?? event.object;
    const local = hit.position.lengthSq() > 0 
        ? hit.position.clone()
        : event.face.normal.clone();
    return local.applyQuaternion(CUBE_TO_WORLD).normalize();
}

export default function ViewCube({ onSelectView }) {
    const { mode } = usePointCloudTheme();
    const colors = CUBE_COLORS[mode] ?? CUBE_COLORS.dark;
    
    const handleClick = (event) => {
        event.stopPropogation();
        onSelectView(viewDirectionFromCubeClick(event));
        return null;
    };

    return ( 
        <GizmoHelper alignment="bottom-right" margin={[90, 90]}>
            <group rotation={CUBE_ROTATION}>
                <GizmoViewcube {...colors} opacity={0.95} onClick={handleClick} />
            </group>
        </GizmoHelper>
    );           
}
            
