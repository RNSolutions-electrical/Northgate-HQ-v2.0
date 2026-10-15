// Percentages have four decimal places; money is rounded half-up at each step.
// Missing settings mean zero so legacy documents retain their original totals.
export function chargePercent(value,label){
 const text=String(value??0);
 if(text.length>100||!/^[0-9]+(?:\.[0-9]{1,4})?$/.test(text)||Number(text)>100)
  throw new Error(`${label} must be between 0 and 100 with at most four decimal places.`);
 const [whole,fraction='']=text.split('.');
 return BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));
}
export function proposalCharges(subtotal,proposal={}){
 const taxRate=chargePercent(proposal.salesTaxPercent,'Sales tax %');
 const cardRate=chargePercent(proposal.creditCardPercent,'Credit card fee %');
 const cents=BigInt(Math.round(Number(subtotal)*100));
 const charge=(base,rate)=>(base*rate+500000n)/1000000n;
 const tax=charge(cents,taxRate),card=charge(cents+tax,cardRate);
 return {preTaxTotal:Number(cents)/100,salesTax:Number(tax)/100,creditCardFee:Number(card)/100,
  price:Number(cents+tax+card)/100};
}
