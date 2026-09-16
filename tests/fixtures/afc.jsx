import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AfcWorkspace} from '../../src/modules/afc/AfcWorkspace.jsx';
createRoot(document.getElementById('root')).render(<BrowserRouter><AfcWorkspace permissions={{userId:'fixture',department:'Electrical',permissions:{can_review_afc_studies:true}}}/></BrowserRouter>);
