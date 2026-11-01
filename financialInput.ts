// Accept a single decimal separator, never infer thousands separators or round input.
export function parseFinancialInput(raw:string):number|null {
 const value=raw.trim();
 if(!/^\d+(?:[.,]\d+)?$/.test(value))return null;
 const number=Number(value.replace(',','.'));
 return Number.isFinite(number)&&number<=Number.MAX_SAFE_INTEGER?number:null;
}
