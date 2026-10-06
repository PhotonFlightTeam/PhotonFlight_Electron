import { createRoot } from 'react-dom/client';
import LasViewer from './lasReader';

const root = createRoot(document.getElementById('root'));
root.render(<LasViewer fileUrl="./CO_test1.laz" />);