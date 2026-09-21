import {useState} from 'react';
import {ClipboardPaste, Save, Trash2} from 'lucide-react';

function ClipboardRow({item, canPaste, onPaste, onSave, onRemove}) {
  const [name, setName] = useState(item.label || 'Reusable estimate item');
  return <div className="estimate-clipboard__item">
    <div><strong>{item.label}</strong><small>{item.type === 'entry' ? 'Entry' : item.type === 'workItem' ? 'Work item' : 'Component'}</small></div>
    <div className="estimate-clipboard__actions">
      <button type="button" disabled={!canPaste} onClick={() => onPaste(item)}><ClipboardPaste size={15}/> Paste here</button>
      <label><span>Future-use name</span><input value={name} onChange={event => setName(event.target.value)}/></label>
      <button type="button" disabled={!onSave || !name.trim()} onClick={() => onSave(item, name.trim())}><Save size={15}/> Save for future use</button>
      <button type="button" aria-label={`Remove ${item.label} from clipboard`} onClick={() => onRemove(item.id)}><Trash2 size={15}/></button>
    </div>
  </div>;
}

export default function EstimateClipboard({items, context, onPaste, onSave, onRemove, onClear}) {
  return <div className="estimate-clipboard">
    <p className="dialog-note">Copied items stay in this estimate workspace until you close it. Navigate to the intended destination, reopen the clipboard, and paste. Saving for future use sends Work Items and Components to the Assembly Library.</p>
    {!items.length ? <p>Nothing has been copied yet.</p> : items.map(item => <ClipboardRow key={item.id} item={item} canPaste={context.editable && (item.type === 'entry' || (item.type === 'workItem' && context.entry) || (item.type === 'component' && context.workItem))} onPaste={onPaste} onSave={item.type === 'entry' ? null : onSave} onRemove={onRemove}/>)}
    {items.length ? <div className="dialog-actions"><button type="button" onClick={onClear}>Clear clipboard</button></div> : null}
  </div>;
}
