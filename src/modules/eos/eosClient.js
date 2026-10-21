const fields=['first_name','last_name','display_name','company','phone','email','address','notes'];
const clean=v=>v?.trim()||null;
export async function saveEosClient(client,form){
 const payload=Object.fromEntries(fields.map(k=>[k,clean(form[k])]));
 if(!payload.display_name)throw Object.assign(new Error('Client name is required.'),{code:'VALIDATION'});
 if(form.id){const r=await client.from('eos_clients').update(payload).eq('id',form.id).select('*').single();if(r.error)throw r.error;return r.data;}
 if(!form.create_id)throw Object.assign(new Error('Reopen New client before saving.'),{code:'VALIDATION'});
 // Stable primary key lets the normal, RLS-protected path recover an uncertain
 // insert without creating another client. It does not bypass table permissions.
 const recovered=await client.from('eos_clients').select('*').eq('id',form.create_id).maybeSingle();if(recovered.error)throw recovered.error;
 if(recovered.data){if(fields.some(k=>(recovered.data[k]||null)!==payload[k]))throw Object.assign(new Error('Saved client differs from this draft. Review the existing contact card.'),{code:'CONFLICT'});return recovered.data;}
 const current=await client.from('eos_clients').select('*').order('display_name');if(current.error)throw current.error;
 const duplicate=current.data.find(c=>c.display_name?.trim().toLocaleLowerCase()===payload.display_name.toLocaleLowerCase());
 if(duplicate)throw Object.assign(new Error('A client with this name already exists. Select it or cancel and review the existing contact card.'),{code:'DUPLICATE_CLIENT',existing:duplicate});
 const r=await client.from('eos_clients').insert({...payload,id:form.create_id}).select('*').single();if(r.error)throw r.error;return r.data;
}
