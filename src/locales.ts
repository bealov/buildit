export const ro={home:'Acasă',projects:'Proiecte',explore:'Explore',match:'Match',market:'Marketplace',profile:'Profil',save:'Salvează',back:'Înapoi',next:'Continuă',demo:'Demo',empty:'Niciun rezultat deocamdată.',analysis:'Smart Analysis',ranking:'Clasamentul săptămânii',boost:'Boost',money:'Capital căutat',published:'Publicat',draft:'Ciornă',notice:'Prototip demonstrativ · Date și persoane fictive',welcome:'Ideile bune merită să fie descoperite.',saved:'Proiecte salvate',purchases:'Achizițiile mele',requests:'Conexiunile tale',preferences:'Preferințe',reset:'Resetează datele demo'};
export const en:Partial<typeof ro>={};
export const t=ro;
export const money=(v:number)=>new Intl.NumberFormat('ro-RO',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(v);
export const num=(v:number)=>new Intl.NumberFormat('ro-RO',{maximumFractionDigits:1}).format(v);
