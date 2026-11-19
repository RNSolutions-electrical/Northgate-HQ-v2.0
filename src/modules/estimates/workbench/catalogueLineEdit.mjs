import {cataloguePriceSnapshot} from './catalogueService.js';
const missing=v=>v==null||String(v).trim()==='';
const unit=v=>String(v||'').trim().toUpperCase();
export function catalogueEditSeed(line,material){
 if(line.blankResourceKind==='labor')throw Error('Labor-only rows cannot edit the material catalogue.');
 if(!material||material.id!==line.catalogueId)throw Error('Select an available catalogue material before editing it.');
 if(unit(line.unit)!==unit(material.unit_of_measure||material.unit))throw Error('The work row and catalogue units differ. Select the correct catalogue item before editing; no automatic unit conversion is applied.');
 const seed=structuredClone(material);
 if(missing(seed.estimating_price_per_unit)&&!missing(line.price)&&(missing(material.price)||line.priceOverride===true||['manual','estimate_override'].includes(line.priceSource)))seed.estimating_price_per_unit=line.price;
 if(missing(seed.neca_labor_input?.hours)&&missing(seed.labor_rate_hrs)&&missing(seed.hours)&&!missing(line.hours))seed.neca_labor_input={hours:line.hours,per:1,unit:line.unit,units_per_catalogue_unit:1,reference:''};
 return seed;
}
export function applyCatalogueFields(line,material,fields){
 catalogueEditSeed(line,material);
 const next={...line};
 if(fields.includes('name'))next.name=material.name;
 if(fields.includes('price')){next.price=material.price;Object.assign(next,cataloguePriceSnapshot(material));delete next.priceOverride;delete next.overrideSource;}
 if(fields.includes('hours')){next.hours=material.hours;delete next.laborOverride;}
 if(fields.length)next.catalogueUpdatedAt=material.updated_at??null;
 return next;
}
