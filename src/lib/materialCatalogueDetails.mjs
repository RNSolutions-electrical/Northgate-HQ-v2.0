export function nonnegative(value, label, optional = false) {
 if (value == null || String(value).trim() === '') {if (optional) return null; throw new Error(`${label} is required.`);}
 const number = Number(value);
 if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be a finite, nonnegative number.`);
 return number;
}
export function vendorAverage(quotes) {
 if (!quotes.length) return null;
 return quotes.reduce((sum, quote) => {
  const amount = nonnegative(quote.price, 'Vendor price'), units = nonnegative(quote.quantity, 'Vendor pricing quantity');
  if (!units) throw new Error('Vendor pricing quantity must be greater than zero.');
  return sum + amount / units;
 }, 0) / quotes.length;
}
export function laborHoursPerUnit(labor, catalogueUnit) {
 const hours = nonnegative(labor.hours, 'Labor hours', true);
 if (hours == null) return null;
 const per = nonnegative(labor.per, 'Labor basis quantity'), factor = nonnegative(labor.units_per_catalogue_unit, 'Labor units per catalogue unit');
 if (!per || !factor || !String(labor.unit || '').trim()) throw new Error('Enter a labor unit and positive conversion quantities.');
 if (String(labor.unit).trim().toUpperCase() === String(catalogueUnit).trim().toUpperCase() && factor !== 1) throw new Error('Matching labor and catalogue units must use a conversion of 1.');
 return hours / per * factor;
}
export function cataloguePayload(values) {
 const vendors = values.vendor_prices.map(quote => {
  if (!quote.vendor.trim()) throw new Error('Each vendor price needs a vendor name.');
  if (quote.url && !/^https?:\/\/\S+$/i.test(quote.url.trim())) throw new Error('Vendor links must start with https:// or http://.');
  return {...quote, vendor:quote.vendor.trim(), url:quote.url.trim(), price:nonnegative(quote.price,'Vendor price'), quantity:nonnegative(quote.quantity,'Vendor pricing quantity')};
 });
 vendorAverage(vendors); laborHoursPerUnit(values.neca_labor,values.unit); nonnegative(values.price,'Average material price',true);
 return {...values, vendor_prices:vendors, aliases:[...new Set(values.aliases.split('\n').map(alias=>alias.trim()).filter(Boolean))], stock:{...values.stock,quantity:nonnegative(values.stock.quantity,'Suggested stock quantity',true)}};
}
