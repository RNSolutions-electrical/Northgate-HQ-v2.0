import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import WorkbenchRoute from '../../src/modules/estimates/workbench/WorkbenchRoute.jsx';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><WorkbenchRoute/></BrowserRouter></React.StrictMode>);
