const statuses = {approved:'Approved',submitted:'Submitted',promoted:'Promoted',returned:'Returned',declined:'Declined',draft:'Draft'};

export function EstimateDirectory({rows, reviewMode=false, personalMode=false, onOpen}) {
 const columns = reviewMode ? ['Project', 'Review type', 'Submitted by', 'Department'] : ['Project', 'Customer', 'Version', 'Status'];
 return <section className="estimate-directory" aria-label={reviewMode ? 'Pending submissions' : personalMode ? 'My Estimates' : 'Workbench estimates'}>
  <h2>{reviewMode ? 'Pending submissions' : personalMode ? 'My Estimates' : 'Workbench estimates'}</h2>
  {rows.length > 0 ? <>
   <div className="estimate-directory-columns" aria-hidden="true">{columns.map(label=><span key={label}>{label}</span>)}</div>
   <ul className="estimate-directory-list">{rows.map(row => {
    const status = row.estimates?.status || 'draft';
    const cells = reviewMode ? [row.estimate_name||'Untitled change', row.task_type||'—', row.submitted_by_name||'—', row.target_division||'—']
      : [row.document.name||'Untitled estimate', row.document.customer||'—', `Version ${row.estimates?.version_number||1}${row.estimates?.revision_of?' · Revised':''}`, statuses[status]||status];
    return <li key={row.destination_id||row.estimate_id||row.personal_id}>
     <button type="button" className="estimate-directory-row" onClick={()=>onOpen(row)}>
      {cells.map((value,index)=><span key={columns[index]} className={`estimate-directory-cell${index===0?' estimate-directory-project':''}`}>
       <span className="estimate-directory-label">{columns[index]}</span>
       {index===3&&!reviewMode ? <span className={`estimate-directory-status estimate-directory-status--${status}`}>{value}</span> : <span>{value}</span>}
      </span>)}
     </button>
    </li>;
   })}</ul>
  </> : <p className="estimate-directory-empty">{reviewMode ? 'No estimates are awaiting review.' : 'No estimates yet.'}</p>}
 </section>;
}
