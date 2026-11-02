import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{App,Boundary}from'./main';
import {configProblemMessage,readRealConfig} from './real/config.ts';
import {parseAuthCallback} from './real/authCallback.ts';
import {readAppMode,writeAppMode} from './real/roles.ts';

// Conturile reale apar doar când VITE_ENABLE_REAL_ACCOUNTS=true și Supabase este configurat.
// Fără configurare, aplicația rulează exact ca prototipul demo.
const real=readRealConfig(import.meta.env);
if(real.problem&&real.problem!=='disabled')console.warn('BuildIT: '+configProblemMessage[real.problem]);
const store=()=>{try{return window.localStorage}catch{return undefined}};
const RealApp=React.lazy(()=>import('./real/RealApp').then(m=>({default:m.RealApp})));

function WithRealAccounts({config}:{config:NonNullable<typeof real.config>}){
 const [mode,setMode]=useState<'demo'|'real'>(()=>parseAuthCallback(location.search,location.hash)?'real':readAppMode(store()));
 const openReal=()=>{writeAppMode(store(),'real');location.hash='home';setMode('real')};
 const openDemo=(route='home')=>{writeAppMode(store(),'demo');location.hash=route;setMode('demo')};
 return mode==='real'?<React.Suspense fallback={null}><RealApp config={config} openDemo={openDemo}/></React.Suspense>:<App key="demo" realAccounts={{open:openReal}}/>;
}

createRoot(document.getElementById('root')!).render(<Boundary>{real.config?<WithRealAccounts config={real.config}/>:<App/>}</Boundary>);
