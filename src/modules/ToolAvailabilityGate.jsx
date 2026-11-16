import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useToolAvailability} from '../hooks/useToolAvailability.jsx';
import {StatePanel} from '../components/ui/StatePanel.jsx';
import {MODULES} from './registry.js';
import {canPreviewDisabledTool,toolForPath,toolIsEnabled,ALWAYS_AVAILABLE} from './toolAvailability.js';
export function useDeveloperToolPreview(permissions,location) {
 const key=toolForPath(location.pathname,MODULES);
 const [previewKey,setPreviewKey]=useState(null);
 const developer=permissions?.permissionSource==='server' && permissions?.canAccessDeveloper===true;
 const requested=canPreviewDisabledTool(permissions,location,key);
 const active=developer && (requested || previewKey===key) ? key : null;
 useEffect(()=>{setPreviewKey(active);},[active]);
 return active;
}
export function ToolAvailabilityGate({permissions,children}) {
 const availability=useToolAvailability();const location=useLocation();
 const key=toolForPath(location.pathname,MODULES);
 const previewKey=useDeveloperToolPreview(permissions,location);
 if(!key || ALWAYS_AVAILABLE.has(key))return children;
 if(availability?.loading)return <StatePanel title="Checking tool availability" compact/>;
 if(availability?.error || !availability)return <section><StatePanel tone="danger" title="Could not verify tool availability" description="This tool is not opened until its status can be confirmed. No data has been changed."/><button className="secondary-button" onClick={()=>availability?.reload()}>Try again</button></section>;
 if(toolIsEnabled(key,availability.rows))return children;
 if(previewKey===key)return <><StatePanel tone="warn" title="Developer preview: tool disabled" description="Hidden from standard navigation and unavailable to ordinary users. Existing permissions still apply. Changes made here are real." compact/>{children}</>;
 return <section><StatePanel tone="warn" title="This tool is currently unavailable" description="A developer has temporarily disabled this tool. Its existing records have been preserved."/><Link to="/dashboard">Return to Dashboard</Link>{permissions.canAccessDeveloper && <p><Link to="/developer" state={{developerSection:'availability'}}>Open Developer Tools to preview or enable it</Link></p>}</section>;
}
