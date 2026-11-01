export type ReviewStatus = 'Documentat'|'Parțial'|'Neidentificat';
export interface ReviewDraft {text:string;source:string;checked:string[];reviewed:boolean}
export const reviewCriteria = [
 {id:'problem',title:'Problema și soluția',words:['problem','soluți','soluti'],help:'Descrie problema concretă, cine o întâmpină și cum o rezolvă produsul. Adaugă dovezi din discuții sau teste cu clienți.'},
 {id:'market',title:'Piața și concurența',words:['piaț','piat','concuren'],help:'Definește clientul, dimensiunea pieței și alternativele existente. Precizează sursele și data informațiilor.'},
 {id:'model',title:'Modelul de venit',words:['venit','abonament','preț','pret'],help:'Explică cine plătește, pentru ce, cât și cât de des. Separă rezultatele observate de ipoteze.'},
 {id:'budget',title:'Buget și necesar de finanțare',words:['buget','finanț','finant','costuri'],help:'Adaugă cheltuielile inițiale și recurente, sursele estimărilor, suma necesară și destinația finanțării.'},
 {id:'roi',title:'Rentabilitate și ipoteze financiare',words:['roi','rentabil','flux de numerar','cash flow'],help:'Explică în ce condiții investiția poate fi recuperată. Include propriile calcule, perioada, ipotezele și scenarii de risc.'},
 {id:'swot',title:'Acoperirea analizei SWOT',words:['swot','puncte forte','ameninț','amenint'],help:'Completează punctele forte, punctele slabe, oportunitățile și amenințările cu argumente specifice proiectului. Instrumentul nu redactează SWOT în locul tău.'},
 {id:'team',title:'Echipă și implementare',words:['echip','calendar','implement'],help:'Precizează responsabilitățile, competențele lipsă, etapele, termenele și resursele necesare.'},
 {id:'validation',title:'Validare și dovezi',words:['validare','intervi','pilot','testat'],help:'Adaugă rezultate ale testelor, feedback de la clienți și indicatorii măsurați. Menționează limitele eșantionului.'},
];
export function reviewPlan(text:string,checked:string[]=[]){
 const paragraphs=text.split(/\n+/).map(t=>t.trim()).filter(Boolean);
 return reviewCriteria.map(c=>{const index=paragraphs.findIndex(p=>c.words.some(w=>new RegExp('(^|[^\\p{L}])'+w,'iu').test(p)));return {...c,status:(index<0?'Neidentificat':checked.includes(c.id)?'Documentat':'Parțial') as ReviewStatus,evidence:index<0?'':paragraphs[index],paragraph:index+1};});
}
