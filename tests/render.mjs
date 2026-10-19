import {build} from 'esbuild';import{renderToString}from'react-dom/server';import React from 'react';import assert from 'node:assert/strict';
await build({entryPoints:['src/main.tsx'],bundle:true,platform:'node',format:'esm',packages:'external',loader:{'.css':'empty'},outfile:'tests/.render-app.mjs'});
await build({entryPoints:['src/model.ts'],bundle:true,platform:'node',format:'esm',outfile:'tests/.model.mjs'});
const {App}=await import('./.render-app.mjs');const {seed}=await import('./.model.mjs');
let count=0;
for(const role of ['creator','investor',null]){const state=seed();state.role=role;state.requests=[{id:'r',project:'p0',investor:'investor',status:'accepted'}];state.purchases=[{id:'t',listing:'l0',buyer:'investor',status:'completed',price:149,date:Date.now()}];globalThis.localStorage={getItem:()=>JSON.stringify(state)};
for(const route of ['welcome','home','explore','projects','new','edit/p0','project/p0','analysis/p0','match','connections','market','listing/l0','listing-edit/p0','purchases','ranking','boost/p0','stats/p0','saved','profile','settings','onboarding']){globalThis.location={hash:'#'+route};const html=renderToString(React.createElement(App));assert.ok(html.length>500,route);assert.ok(!html.includes('NaN'),route);count++}}
console.log(`${count} server-render checks passed (21 routes × 3 session states). No browser layout or gesture verification.`);
