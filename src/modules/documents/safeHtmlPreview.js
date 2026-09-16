// Detached <template> contents stay inert. Build a fresh, deliberately limited
// document tree; never attach the source nodes, attributes, scripts, or styles.
export function safeHtmlPreview(source,targetDocument=document){
 const template=targetDocument.createElement('template');template.innerHTML=source;
 const allowed=new Set(['P','DIV','SPAN','H1','H2','H3','H4','H5','H6','TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','UL','OL','LI','BR','HR','STRONG','B','EM','I','SMALL','PRE','CODE','BLOCKQUOTE','CAPTION']);
 const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','FORM','INPUT','BUTTON','SVG','MATH','AUDIO','VIDEO','BASE']);
 const root=targetDocument.createElement('article');
 function copy(node,parent){
  if(node.nodeType===3){parent.appendChild(targetDocument.createTextNode(node.textContent));return;}
  if(node.nodeType!==1||blocked.has(node.tagName))return;
  if(node.tagName==='IMG'){if(node.getAttribute('alt'))parent.appendChild(targetDocument.createTextNode('[Image: '+node.getAttribute('alt')+']'));return;}
  let dest=parent;if(allowed.has(node.tagName)){dest=targetDocument.createElement(node.tagName.toLowerCase());parent.appendChild(dest);for(const attr of ['colspan','rowspan'])if(['TD','TH'].includes(node.tagName)&&/^\d{1,2}$/.test(node.getAttribute(attr)||''))dest.setAttribute(attr,node.getAttribute(attr));}
  for(const child of node.childNodes)copy(child,dest);
 }
 for(const child of template.content.childNodes)copy(child,root);
 return root;
}
