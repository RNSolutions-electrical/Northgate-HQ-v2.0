import {cataloguePayload} from '../../../lib/materialCatalogueDetails.mjs';
import {materialAliases} from '../../../lib/materialResolver.js';

const key=value=>String(value??'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const referenceSources=new Set(['estimating_master','inventory_explicit','legacy_catalogue']);

export function catalogueCreateSeed(line){
 const price=line.price;
 return {
  name:String(line.name??'').trim(),
  unit:String(line.unit??'').trim(),
  material_code:String(line.material_code??line.catalogueNumber??'').trim(),
  price:!line.priceOverride&&referenceSources.has(line.priceSource)&&price!=null&&String(price).trim()!==''&&Number.isFinite(Number(price))&&Number(price)>=0?price:'',
 };
}

export function possibleCatalogueDuplicates(materials,{name,unit,material_code}){
 const nameKey=key(name),unitKey=key(unit),codeKey=key(material_code);
 return materials.filter(material=>Boolean(
  (codeKey&&codeKey===key(material.material_code))||
  (nameKey&&unitKey===key(material.unit_of_measure||material.unit)&&(key(material.name)===nameKey||materialAliases(material).some(alias=>key(alias)===nameKey)))
 ));
}

export function makeCatalogueCreatePayload(values){
 const name=String(values.name).trim(),unit=String(values.unit).trim(),material_code=String(values.material_code).trim();
 if(!name||!unit||!material_code)throw Error('Enter a description, unit and catalogue number.');
 return cataloguePayload({name,unit,material_code,price:values.price,aliases:'',vendor_prices:[],catalogue_notes:'',
  neca_labor:{hours:'',per:1,unit,units_per_catalogue_unit:1,reference:''},
  stock:{in_stock:false,quantity:'',storage_unit:'',shelf:'',bay:'',bin:''}});
}

export function linkCataloguePreservingEstimate(line,material){
 if(!material?.id||!key(line.unit)||key(line.unit)!==key(material.unit_of_measure||material.unit))throw Error('This material must use the same unit as the work item row.');
 const different=(a,b)=>a==null||String(a).trim()===''?b!=null&&String(b).trim()!=='':b==null||String(b).trim()===''||Number(a)!==Number(b);
 const next={...line,catalogueId:material.id,catalogueUpdatedAt:material.updated_at??null};
 if(different(line.price,material.price)){next.priceOverride=true;next.overrideSource='estimate_only';}
 if(different(line.hours,material.hours))next.laborOverride=true;
 return next;
}
