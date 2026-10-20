import {parseCsv} from './scorecardCsv.js';
export const BULK_COLUMNS=['Metric','Date','Value','Notes','Format','Review','Source','System reference'];
export const parseBulkCsv=text=>parseCsv(text,BULK_COLUMNS);
const protect=value=>/^[\s]*[=+\-@\t\r\n']/.test(String(value??''))?"'"+value:String(value??'');
export function bulkCsv(rows){
 const quote=v=>'"'+String(v).replaceAll('"','""')+'"';
 return '\uFEFF'+[BULK_COLUMNS.map(quote).join(','),...rows.map(row=>BULK_COLUMNS.map(k=>quote(k==='Value'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(row[k])?row[k]:protect(row[k]))).join(','))].join('\r\n');
}
