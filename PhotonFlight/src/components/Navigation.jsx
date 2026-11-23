import { useEffect, useRef } from 'react';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import CloseIcon from '@mui/icons-material/Close';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import KeyboardDoubleArrowUpIcon from '@mui/icons-material/KeyboardDoubleArrowUp';
import KeyboardDoubleArrowDownIcon from '@mui/icons-material/KeyboardDoubleArrowDown';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import useStore from '../useStore';

const viewButtons = [
    { label: 'Top (T)', key: 't' },
    { label: 'Bottom (B)', key: 'b' },
    { label: 'Front (F)', key: 'f' },
    { label: 'Back (V)', key: 'v' },
    { label: 'Left (L)', key: 'l' },
    { label: 'Right (R)', key: 'r' },
    { label: 'Reset view (Space)', key: ' ' },
];

const panButtons = [
    { label: 'Move forward', hint: 'Pan forward.', action: 'pan-forward', icon: ArrowUpwardIcon, position: 'forward' },
    { label: 'Move backward', hint: 'Pan backward.', action: 'pan-backward', icon: ArrowDownwardIcon, position: 'backward' },
    { label: 'Move left', hint: 'Pan left.', action: 'pan-left', icon: ArrowBackIcon, position: 'left' },
    { label: 'Move right', hint: 'Pan right.', action: 'pan-right', icon: ArrowForwardIcon, position: 'right' },
];

const verticalButtons = [
    { label: 'Move up', hint: 'Pan up relative to camera.', action: 'pan-up', icon: KeyboardDoubleArrowUpIcon, position: 'up' },
    { label: 'Move down', hint: 'Pan down relative to camera.', action: 'pan-down', icon: KeyboardDoubleArrowDownIcon, position: 'down' },
];

const rotationButtons = [
    { label: 'Rotate camera left', hint: 'Rotate camera left.', action: 'rotate-camera-left', icon: RotateLeftIcon, position: 'rotate-left' },
    { label: 'Rotate camera right', hint: 'Rotate camera right.', action: 'rotate-camera-right', icon: RotateRightIcon, position: 'rotate-right' },
];

const movementButtonGroups = [
    { label: 'Vertical camera movement', buttons: verticalButtons },
    { label: 'Camera rotation', buttons: rotationButtons },
];

const holdRepeatDelay = 300;
const holdRepeatInterval = 80;

export default function Navigation() {
    const setActiveNavItem = useStore((state) => state.setActiveNavItem);
    const controlMode = useStore((state) => state.controlMode);
    const activeHold = useRef(null);

    const changeControlMode = (mode) => {
        window.dispatchEvent(new CustomEvent('control-mode-requested', { detail: mode }));
    };

    const requestAction = (key) => {
        window.dispatchEvent(new CustomEvent('view-control-action', { detail: key }));
    };

    const clearHoldTimers = (hold = activeHold.current) => {
        if (!hold) return;
        window.clearTimeout(hold.timeout);
        window.clearInterval(hold.interval);
    };

    const startHoldAction = (action) => (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        clearHoldTimers();

        const hold = { action, pointerId: event.pointerId, timeout: null, interval: null };
        activeHold.current = hold;
        requestAction(action);
        hold.timeout = window.setTimeout(() => {
            if (activeHold.current !== hold) return;
            hold.interval = window.setInterval(() => requestAction(action), holdRepeatInterval);
        }, holdRepeatDelay);
    };

    const stopHoldAction = (event, canceled = false) => {
        const hold = activeHold.current;
        if (!hold || hold.pointerId !== event.pointerId) return;

        clearHoldTimers(hold);
        if (canceled) activeHold.current = null;
    };

    const clickAction = (action) => () => {
        if (activeHold.current?.action === action) {
            activeHold.current = null;
            return;
        }
        requestAction(action);
    };

    useEffect(() => {
        const cancelHold = () => {
            clearHoldTimers();
            activeHold.current = null;
        };
        window.addEventListener('blur', cancelHold);

        return () => {
            window.removeEventListener('blur', cancelHold);
            cancelHold();
        };
    }, []);

    return (
        <aside className="plugin-sidebar navigation-sidebar" aria-label="Navigation">
            <div className="plugin-sidebar-header">
                <span>NAVIGATION</span>
                <IconButton
                    size="small"
                    onClick={() => setActiveNavItem(null)}
                    aria-label="Close navigation panel">
                    <CloseIcon fontSize="small" />
                </IconButton>
            </div>
            <div className="navigation-controls">
                <div className="navigation-section">
                    <div className="navigation-section-title">CONTROL MODE</div>
                    <div className="navigation-mode-toggle">
                        <Button
                            size="small"
                            variant={controlMode === 'flight' ? 'contained' : 'outlined'}
                            aria-pressed={controlMode === 'flight'}
                            onClick={() => changeControlMode('flight')}>
                            Flight
                        </Button>
                        <Button
                            size="small"
                            variant={controlMode === 'position' ? 'contained' : 'outlined'}
                            aria-pressed={controlMode === 'position'}
                            onClick={() => changeControlMode('position')}>
                            Position
                        </Button>
                    </div>
                </div>

                <div className="navigation-section">
                    <div className="navigation-section-title">VIEWS</div>
                    <div className="navigation-button-grid">
                        {viewButtons.map(({ label, key }) => (
                            <Button key={key} size="small" variant="outlined" onClick={() => requestAction(key)}>
                                {label}
                            </Button>
                        ))}
                    </div>
                </div>

                <div className="navigation-section">
                    <div className="navigation-section-title">CAMERA MOVEMENT</div>
                    <div className="navigation-movement-layout" role="group" aria-label="Camera movement">
                        <div className="navigation-dpad" role="group" aria-label="Pan camera">
                            {panButtons.map(({ label, hint, action, icon: Icon, position }) => (
                                <Tooltip key={action} title={hint} describeChild enterDelay={400}>
                                    <Button
                                        className={`navigation-control-${position}`}
                                        variant="outlined"
                                        aria-label={label}
                                        onClick={clickAction(action)}
                                        onPointerDown={startHoldAction(action)}
                                        onPointerUp={stopHoldAction}
                                        onPointerCancel={(event) => stopHoldAction(event, true)}>
                                        <Icon fontSize="small" />
                                    </Button>
                                </Tooltip>
                            ))}
                            <span className="navigation-control-center" aria-hidden="true" />
                        </div>
                        <div className="navigation-movement-side">
                            {movementButtonGroups.map(({ label: groupLabel, buttons }) => (
                                <div
                                    key={groupLabel}
                                    className="navigation-button-pair"
                                    role="group"
                                    aria-label={groupLabel}>
                                    {buttons.map(({ label, hint, action, icon: Icon, position }) => (
                                        <Tooltip key={action} title={hint} describeChild enterDelay={400}>
                                            <Button
                                                className={`navigation-control-${position}`}
                                                variant="outlined"
                                                aria-label={label}
                                                onClick={clickAction(action)}
                                                onPointerDown={startHoldAction(action)}
                                                onPointerUp={stopHoldAction}
                                                onPointerCancel={(event) => stopHoldAction(event, true)}>
                                                <Icon fontSize="small" />
                                            </Button>
                                        </Tooltip>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
