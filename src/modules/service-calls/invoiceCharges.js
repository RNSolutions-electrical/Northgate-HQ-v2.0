// Match PostgreSQL numeric round(): round each positive charge to cents in order.
const hundredths = (value,label,max) => {
  const text=String(value ?? '').trim().replace(/^\./,'0.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`Enter ${label} with at most two decimal places.`);
  const [whole,fraction='']=text.split('.');
  const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if (result>max) throw new Error(`${label} is outside the allowed range.`);
  return result;
};
export function invoiceCharges(subtotal,taxPercent,cardPercent) {
  const net=hundredths(subtotal,'Subtotal',99999999999999n);
  const taxRate=hundredths(taxPercent,'Sales Tax %',10000n);
  const cardRate=hundredths(cardPercent,'Credit Card Fee %',10000n);
  const tax=(net*taxRate+5000n)/10000n;
  const fee=((net+tax)*cardRate+5000n)/10000n;
  if (net+tax+fee>99999999999999n) throw new Error('Invoice total is outside the allowed range.');
  return {subtotal:Number(net)/100,salesTax:Number(tax)/100,creditCardFee:Number(fee)/100,total:Number(net+tax+fee)/100};
}
