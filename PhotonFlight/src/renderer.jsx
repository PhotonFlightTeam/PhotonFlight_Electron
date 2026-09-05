import { createRoot } from 'react-dom/client';
import LasViewer from './lasReader';

const root = createRoot(document.getElementById('root'));
root.render(<LasViewer fileUrl="./PanHandle_13.laz" />);