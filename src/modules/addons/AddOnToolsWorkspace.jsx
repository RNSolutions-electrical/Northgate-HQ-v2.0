import {Link} from 'react-router-dom';
import {permittedModules} from '../registry.js';
export function AddOnToolsWorkspace({permissions}){
 const tools=permittedModules(permissions).filter(module=>module.requiresAddon);
 return <section><h1>Add-On Tools</h1><div className="addon-tools-list">
  {tools.map(tool=>{const Icon=tool.icon;return <Link className="addon-tool" key={tool.key} to={tool.path}><Icon aria-hidden="true"/><strong>{tool.label}</strong></Link>;})}
  {!tools.length&&<p>No add-on tools are assigned to your account.</p>}
 </div></section>;
}
