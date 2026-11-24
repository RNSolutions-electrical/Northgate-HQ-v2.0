import React from 'react';
import {money} from './model.mjs';

const hours=value=>`${value.toFixed(2)} hr`;
function Figures({rows,className=''}){return <dl className={'blank-totals '+className}>{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;}

export default function EstimateSummary({total}){
 const labor=total.hoursByRole;
 return <aside className="blank-summary" aria-label="Estimate summary">
  <h2>Estimate summary</h2>
  <section className="blank-planning blank-summary-details" aria-label="Included labor hours">
   <Figures className="blank-summary-hours" rows={[
    ['Total labor hours',hours(total.hours)],
    ...[['Field',labor.field],['Supervision',labor.supervision],['Estimating',labor.estimating],['Unclassified',labor.unclassified]]
       .filter(([,value])=>value>0).map(([label,value])=>[label,hours(value)]),
   ]}/>
   {labor.unclassified>0&&<p>Unclassified hours are included in the total but have no recognized labor category.</p>}
  </section>
  <section className="blank-planning blank-summary-details" aria-label="Resource costs and selling prices">
   <table className="blank-summary-resources" aria-label="Costs and selling prices by resource">
    <thead><tr><th scope="col">Resource</th><th scope="col">Cost</th><th scope="col">Sell</th></tr></thead>
    <tbody>{[['Material',total.material,total.materialSell],['Labor',total.labor,total.laborSell],['Quotes',total.other,total.quoteSell]].map(([name,cost,sell])=>
     <tr key={name}><th scope="row">{name}</th><td>{money(cost)}</td><td>{money(sell)}</td></tr>)}</tbody>
    <tfoot><tr><th scope="row">Total cost</th><td>{money(total.cost)}</td><td/></tr></tfoot>
   </table>
   <p>Labor cost uses hard rates. Sell includes line adjustments, before whole-estimate discount, fees and tax.</p>
  </section>
  <Figures rows={[
   ['Before discounts',total.grossPreDiscount],...(total.resourceAddition?[['Material / labor additions (included above)',total.resourceAddition]]:[]),
   ['Material / labor discounts',total.resourceDiscount],['Whole-estimate discount',total.estimateDiscount],['Total discounts',total.totalDiscount],
   ['Subtotal before tax',total.preTaxTotal],['Sales tax',total.salesTax],['Credit card fee',total.creditCardFee],['Proposal total',total.price],
  ].map(([label,value])=>[label,money(value)])}/>
 </aside>;
}
