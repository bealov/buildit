import {useEffect,useRef,useState} from 'react';
import {ZoomIn,ZoomOut} from 'lucide-react';
import type {Profile} from './model';
import {deleteLocal,getLocal,putLocal} from './files';
const initials=(name:string)=>name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('');
/** Inițialele stau sub fotografie: sunt vizibile cât timp poza se descarcă sau dacă nu poate fi afișată. */
export function Avatar({profile}:{profile:Pick<Profile,'name'|'photo'>}){return profile.photo?<><span className="avatar-initials" aria-hidden="true">{initials(profile.name)}</span><img key={profile.photo} className="profile-photo" src={profile.photo} alt={`Poza lui ${profile.name}`} onError={e=>{e.currentTarget.hidden=true}}/></>:<>{initials(profile.name)}</>}

const VIEW=240,OUT=256,MAX_ZOOM=3,MAX_BYTES=1024*1024;
type Pos={x:number;y:number};
type Framing={zoom:number;pos:Pos};
type Source={url:string;img:HTMLImageElement;file:Blob;init?:Framing};
/** Originalul fotografiei și ultima încadrare, păstrate doar în acest browser. */
type Original={blob:Blob;zoom:number;x:number;y:number};
const originalId=(key:string)=>'photo-original:'+key;
/** Șterge originalul local după ce eliminarea fotografiei a fost salvată. */
export const forgetPhotoOriginal=(key:string)=>deleteLocal(originalId(key)).catch(()=>{});

/** Selectează o fotografie, o încadrează într-un cerc și transmite doar rezultatul final (JPEG pătrat).
 *  Cu `save`, rezultatul este încărcat imediat; fără `save` (modul demo), este transmis prin `onChange`. */
export function PhotoEditor({profile,onChange,onBusy,save,originalKey,note='JPG, PNG sau WebP · maximum 5 MB. Salvăm local o miniatură.'}:{profile:Pick<Profile,'name'|'photo'>;onChange:(photo?:string)=>void;onBusy:(busy:boolean)=>void;save?:(photo:string)=>Promise<void>;originalKey?:string;note?:string}){
 const [error,E]=useState(''),[busy,B]=useState(false),[source,setSource]=useState<Source|null>(null),[hasOriginal,setHasOriginal]=useState(false);
 useEffect(()=>()=>{if(source)URL.revokeObjectURL(source.url)},[source]);
 useEffect(()=>{let live=true;if(!originalKey||!profile.photo){setHasOriginal(false);return}getLocal<Original>(originalId(originalKey)).then(o=>{if(live)setHasOriginal(o?.blob instanceof Blob)},()=>{if(live)setHasOriginal(false)});return()=>{live=false}},[originalKey,profile.photo]);
 const open=async(file:Blob,init?:Framing)=>{const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight)throw Error();setSource({url,img,file,init})}catch(e){URL.revokeObjectURL(url);throw e}};
 const commit=async(photo:string,framing:Framing)=>{const file=source?.file;onBusy(true);try{if(save)await save(photo);else onChange(photo);setSource(null)}finally{onBusy(false)}
  if(originalKey&&file)putLocal(originalId(originalKey),{blob:file,zoom:framing.zoom,x:framing.pos.x,y:framing.pos.y} satisfies Original).then(()=>setHasOriginal(true),()=>setHasOriginal(false))};
 const reframe=async()=>{if(!originalKey)return;E('');B(true);onBusy(true);try{const o=await getLocal<Original>(originalId(originalKey));if(!(o?.blob instanceof Blob))throw Error();await open(o.blob,{zoom:o.zoom,pos:{x:o.x,y:o.y}})}catch{setHasOriginal(false);E('Originalul nu mai este disponibil în acest browser. Alege din nou poza pentru a o încadra.')}finally{B(false);onBusy(false)}};
 // Eliminarea devine definitivă abia la salvarea profilului; atunci se apelează forgetPhotoOriginal.
 return <section className="photo-editor"><div className="large-avatar"><Avatar profile={profile}/></div><div><h3>Poza de profil</h3><p className="caption">{note}</p><label className="upload-control">{busy?'Se pregătește…':profile.photo?'Schimbă poza':'Adaugă o poză'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;E('');if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){E('Alege o imagine JPG, PNG sau WebP de maximum 5 MB.');return}B(true);onBusy(true);try{await open(file)}catch{E('Imaginea nu a putut fi procesată. Încearcă alta.')}finally{B(false);onBusy(false)}}}/><small className="upload-hint">După ce alegi poza, o poți încadra înainte de salvare.</small></label>{profile.photo&&<div className="photo-actions">{hasOriginal&&<button type="button" className="text-button" disabled={busy} onClick={()=>void reframe()}>Reîncadrează</button>}<button type="button" className="text-button" disabled={busy} onClick={()=>onChange(undefined)}>Elimină poza</button></div>}{error&&<p className="error" role="alert">{error}</p>}</div>{source&&<PhotoCrop source={source} save={commit} onCancel={()=>setSource(null)}/>}</section>
}

const jpegBytes=(dataUrl:string)=>Math.floor((dataUrl.length-dataUrl.indexOf(',')-1)*3/4);

function PhotoCrop({source,save,onCancel}:{source:Source;save:(photo:string,framing:Framing)=>Promise<void>;onCancel:()=>void}){
 const ref=useRef<HTMLDialogElement>(null),drag=useRef<{id:number;x:number;y:number;start:Pos}|null>(null),saving=useRef(false);
 const [zoom,setZoom]=useState(()=>Math.min(MAX_ZOOM,Math.max(1,source.init?.zoom??1))),[pos,setPos]=useState<Pos>(()=>source.init?.pos??{x:0,y:0}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const d=ref.current;d?.showModal();return()=>d?.close()},[]);
 const {img}=source,w=img.naturalWidth,h=img.naturalHeight;
 // Scara la care imaginea acoperă exact cercul; zoom 1 = fără margini goale.
 const scaleAt=(z:number)=>VIEW/Math.min(w,h)*z;
 const clamp=(p:Pos,z:number):Pos=>{const s=scaleAt(z),mx=(w*s-VIEW)/2,my=(h*s-VIEW)/2;return {x:Math.max(-mx,Math.min(mx,p.x)),y:Math.max(-my,Math.min(my,p.y))}};
 useEffect(()=>{setPos(p=>clamp(p,zoom))},[]); // încadrarea salvată anterior, readusă în limite
 const scale=scaleAt(zoom),dw=w*scale,dh=h*scale;
 const changeZoom=(z:number)=>{setPos(p=>clamp({x:p.x*z/zoom,y:p.y*z/zoom},z));setZoom(z)};
 const render=()=>{
  const canvas=document.createElement('canvas');canvas.width=OUT;canvas.height=OUT;const ctx=canvas.getContext('2d');if(!ctx)throw Error();
  const side=Math.min(w,h,VIEW/scale),sx=Math.max(0,Math.min(w-side,((dw-VIEW)/2-pos.x)/scale)),sy=Math.max(0,Math.min(h-side,((dh-VIEW)/2-pos.y)/scale));
  ctx.fillStyle='#fff';ctx.fillRect(0,0,OUT,OUT);ctx.imageSmoothingQuality='high';ctx.drawImage(img,sx,sy,side,side,0,0,OUT,OUT);
  for(const q of [0.86,0.7,0.5]){const d=canvas.toDataURL('image/jpeg',q);if(jpegBytes(d)<=MAX_BYTES)return d}
  throw Error('size');
 };
 const submit=async()=>{
  if(saving.current)return;let photo:string;
  try{photo=render()}catch{setError('Fotografia nu a putut fi pregătită. Încearcă altă imagine.');return}
  saving.current=true;setBusy(true);setError('');
  try{await save(photo,{zoom,pos})}catch{saving.current=false;setBusy(false);setError('Fotografia nu a putut fi încărcată. Verifică conexiunea și apasă din nou „Salvează fotografia”; încadrarea aleasă a rămas neschimbată.')}
 };
 const cancel=()=>{if(!saving.current)onCancel()};
 const nudge=(dx:number,dy:number)=>setPos(p=>clamp({x:p.x+dx,y:p.y+dy},zoom));
 return <dialog ref={ref} className="crop-dialog" aria-labelledby="crop-title" onCancel={e=>{e.preventDefault();cancel()}}>
  <div className="modal-head"><h2 id="crop-title">Încadrează fotografia</h2></div>
  <p className="caption">Trage imaginea pentru a o poziționa și folosește sliderul pentru zoom.</p>
  <div className="crop-view" role="img" aria-label="Previzualizare circulară. Folosește săgețile pentru a muta imaginea." tabIndex={0} aria-disabled={busy}
   onKeyDown={e=>{if(busy)return;const k={ArrowLeft:[10,0],ArrowRight:[-10,0],ArrowUp:[0,10],ArrowDown:[0,-10]}[e.key];if(k){e.preventDefault();nudge(k[0],k[1])}}}
   onPointerDown={e=>{if(busy||drag.current)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,start:pos}}}
   onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;setPos(clamp({x:d.start.x+e.clientX-d.x,y:d.start.y+e.clientY-d.y},zoom))}}
   onPointerUp={e=>{if(drag.current?.id===e.pointerId)drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
   <img src={source.url} alt="" draggable={false} style={{width:dw,height:dh,left:(VIEW-dw)/2+pos.x,top:(VIEW-dh)/2+pos.y}}/>
  </div>
  <label className="crop-zoom"><ZoomOut size={16} aria-hidden="true"/><input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom} disabled={busy} aria-label="Zoom" onChange={e=>changeZoom(Number(e.target.value))}/><ZoomIn size={16} aria-hidden="true"/></label>
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="actions"><button type="button" className="btn secondary" disabled={busy} onClick={cancel}>Anulează</button><button type="button" className="btn" disabled={busy} onClick={()=>void submit()}>{busy?'Se încarcă…':'Salvează fotografia'}</button></div>
 </dialog>;
}
