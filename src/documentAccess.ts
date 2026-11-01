import {matched,ownsProject,currentCreator,type State,type Project} from './model.ts';import {collaborationConfirmed} from './creatorMatching.ts';
export const canReadProject=(s:State,p:Project)=>ownsProject(s,p)||matched(s,p.id)||collaborationConfirmed(s,currentCreator(s),p);
