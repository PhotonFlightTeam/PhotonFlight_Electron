import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import NearMeIcon from '@mui/icons-material/NearMe';
import SquareFootIcon from '@mui/icons-material/SquareFoot';
import PushPinIcon from '@mui/icons-material/PushPin';

export default function ToolBar({ activeTool, setActiveTool }: { activeTool: string | null; setActiveTool: (tool: string) => void }) {

    // Returns a toolbar with 3 icons that have colors based on state
    return (
        <Box sx={{ '& > :not(style)': { m: 1 } }}>
            <Fab 
            color={activeTool === 'Select' ? 'primary' : 'default'}            
            onClick={() => setActiveTool('Select')}>
                <NearMeIcon />
            </Fab>
            <Fab 
            color={activeTool === 'Measure' ? 'secondary' : 'default'}
            onClick={() => setActiveTool('Measure')}>
                <SquareFootIcon />
            </Fab>
            <Fab  
            color={activeTool === 'Pin' ? 'error' : 'default'}
            onClick={() => setActiveTool('Pin')}>
                <PushPinIcon />
            </Fab>
        </Box>
    )
}