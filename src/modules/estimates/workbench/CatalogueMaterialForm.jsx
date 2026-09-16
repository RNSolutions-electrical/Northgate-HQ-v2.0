import React from 'react';
export default function CatalogueMaterialForm({line,material,busy,error,onSave}){
 return <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);onSave(Object.fromEntries(f));}}>
  <p className="dialog-note">Saves shared catalogue details immediately. Existing estimate prices and hours stay unchanged. A blank catalogue number creates a temporary code flagged for review.</p>
  {error&&<p role="alert" className="save-error">{error}</p>}
  <fieldset disabled={busy} className="resource-fields">
   <label className="wide">Description<input name="name" required defaultValue={material?.name||line.name}/></label>
   <label>Catalogue number / material code<input name="material_code" defaultValue={material?.catalogue_draft?'':material?.material_code||''}/></label>
   <label>Unit<input name="unit" required defaultValue={material?.unit||line.unit}/></label>
   <label>Unit cost<input name="price" type="number" min="0" step="any" defaultValue={material?material.price??'':line.price??''}/></label>
   <label>Labor hours per unit<input name="hours" type="number" min="0" step="any" defaultValue={material?material.hours??'':line.hours??''}/></label>
  </fieldset><div className="dialog-actions"><button className="primary" disabled={busy}>Save catalogue material</button></div>
 </form>;
}
