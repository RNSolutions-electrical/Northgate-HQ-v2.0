import {AttachedEstimates} from '../../src/modules/estimates/AttachedEstimates.jsx';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import WorkbenchRoute from '../../src/modules/estimates/workbench/WorkbenchRoute.jsx';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/primitives.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter>{location.search.includes('checklist-review')?<AttachedEstimates jobId="job-1" permissions={{canViewProjectFinancials:true,canViewProtectedProjectFinancials:true}}/>:<WorkbenchRoute libraryOnly={location.search.includes('library-only')}/>}</BrowserRouter></React.StrictMode>);
