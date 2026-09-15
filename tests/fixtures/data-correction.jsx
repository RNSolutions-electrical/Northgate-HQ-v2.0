import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {RetiredBinAssignments} from '../../src/modules/inventory/RetiredBinAssignments.jsx';
import {DeveloperDataCorrectionControl} from '../../src/modules/developer/DeveloperDataCorrectionControl.jsx';
import {StatePanel} from '../../src/components/ui/StatePanel.jsx';
import {canCorrectInventoryData} from '../../src/modules/inventory/dataCorrectionAccess.js';
import '../../src/styles/tokens.css';import '../../src/styles/base.css';import '../../src/styles/primitives.css';import '../../src/modules/developer/permissionTemplates.css';
function Fixture(){
 const [version,setVersion]=useState(0),p=new URLSearchParams(location.search);
 const role=p.get('role')||'Developer', permissions={permissionSource:'server',role,canAccessDeveloper:role==='Developer',canDeveloperDataCorrection:window.correctionFixture.enabled};
 const reload=()=>setVersion(version+1),user={user_id:'dev',email:'developer@example.test',role:'Developer',active_overrides:window.correctionFixture.enabled?[{permission_flag:'can_developer_data_correction',granted:true,is_active:true}]:[]};
 return <main style={{maxWidth:1100,margin:'auto',padding:16}}>
 {canCorrectInventoryData(permissions)&&<StatePanel tone="warning" compact title="Developer Data Correction enabled" description="History and stock safeguards remain enforced."/>}
 <DeveloperDataCorrectionControl user={user} permissions={permissions} onSaved={reload}/>
 <RetiredBinAssignments location={{id:'bin1',code:'C211',archived_at:p.has('archived')?'2026-09-15':null}} permissions={permissions} onRestored={reload}/>
 </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
