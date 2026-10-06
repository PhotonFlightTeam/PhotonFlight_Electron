import { useState, useEffect, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import ToolTip from '@mui/material/Tooltip';
// import './pluginLibrary.css'; // TODO: Finish pluginLibrary.css.

// Plugin icon: falls back to the first letter of the name when there's no image
const PluginIcon = ({plugin, className }) => (
    <Avatar className={className} src={plugin.icon ?? undefined} alt={plugin.name}>
        {plugin.name.charAt(0).toUpperCase()}
    </Avatar>
);

//TODO: Rest of PluginLibrary.jsx
