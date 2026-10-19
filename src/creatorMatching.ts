import {type State,type Project,uid} from './model.ts';
export type CollaborationKind='partner'|'merger';
export interface CreatorRequest {id:string;fromProject:string;toProject:string;kind:CollaborationKind;status:'pending'|'accepted'|'declined';created:number}
export const creatorRequests=(s:State)=>s.creatorRequests||[];
export function candidates(s:State,owner:string,kind:CollaborationKind){return s.projects.filter(p=>p.published&&p.owner!==owner&&p[kind])}
export function sendCollaboration(s:State,actor:string,fromId:string,toId:string,kind:CollaborationKind):State{
 const from=s.projects.find(p=>p.id===fromId),to=s.projects.find(p=>p.id===toId);
 if(s.role!=='creator'||!from?.published||!to?.published||from.owner!==actor||from.owner===to.owner||!from[kind]||!to[kind])return s;
 if(creatorRequests(s).some(r=>r.kind===kind&&r.status!=='declined'&&((r.fromProject===fromId&&r.toProject===toId)||(r.fromProject===toId&&r.toProject===fromId))))return s;
 return {...s,creatorRequests:[...creatorRequests(s),{id:uid(),fromProject:fromId,toProject:toId,kind,status:'pending',created:Date.now()}]};
}
export function respondCollaboration(s:State,actor:string,id:string,status:'accepted'|'declined'):State{
 const r=creatorRequests(s).find(r=>r.id===id);if(s.role!=='creator'||!r||r.status!=='pending')return s;
 const from=s.projects.find(p=>p.id===r.fromProject),to=s.projects.find(p=>p.id===r.toProject);
 if(!from||to?.owner!==actor||status==='accepted'&&(!from.published||!to.published||!from[r.kind]||!to[r.kind]))return s;
 return {...s,creatorRequests:creatorRequests(s).map(x=>x.id===id?{...x,status}:x)};
}
export function collaborationConfirmed(s:State,actor:string,target:Project){return s.role==='creator'&&creatorRequests(s).some(r=>{if(r.status!=='accepted')return false;const from=s.projects.find(p=>p.id===r.fromProject),to=s.projects.find(p=>p.id===r.toProject);return from?.owner===actor&&to?.id===target.id||to?.owner===actor&&from?.id===target.id})}
