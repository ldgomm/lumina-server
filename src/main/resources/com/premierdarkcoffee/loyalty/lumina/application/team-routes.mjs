import { changeMemberState, createTeamMember, limit, manageAccount, teamMember, updateGrants, updateMember } from '../access/accounts.mjs';
import { teamBase } from '../access/team-administration.mjs';
import { teamDirectory, teamHistory } from '../access/team-directory.mjs';
import { saveTeamAccess } from '../access/team-access.mjs';
import { invitePage, memberPage, newMemberPage, teamPage } from '../presentation/pages/team-pages.mjs';
import { isId, Problem, requireThat } from '../shared/domain.mjs';

export async function teamRoutes({db,bridge,wallets,actor,company,path,method,data,query,render,redirect,freshActor}) {
  const base=teamBase(actor);
  const credential=()=>actor.kind==='AGENCY'?undefined:wallets.ownerCredential(actor);
  const invitation=(id,code)=>({title:'Acceso creado',body:invitePage(teamMember(db,actor,id),code,actor)});
  if(path===base&&method==='GET')return render({title:'Equipos y roles',body:teamPage(actor,company,teamDirectory(db,actor,query))});
  if(path===base+'/new'&&method==='GET')return render({title:'Añadir persona',body:newMemberPage(actor)});
  if(path===base&&method==='POST')try {
    const result=createTeamMember(db,actor,data);return render(invitation(result.id,result.code),201);
  } catch(issue) {
    if(!(issue instanceof Problem))throw issue;
    return render({title:'Añadir persona',body:newMemberPage(actor,data,issue.message)},issue.status);
  }
  const match=path.slice(base.length).match(/^\/([^/]+)(?:\/(access|permissions|details|invite|disable|suspend|resume|delete|restore|cashier\/(?:branches|save|revoke)))?$/);
  requireThat(match&&isId(match[1]),'Persona no encontrada.',404);
  const [,id,action]=match;
  teamMember(db,actor,id);
  const memberView=async(options={},loadBranches=true)=>{
    let branches=null;const member=teamMember(db,actor,id);
    if(loadBranches&&member.active&&member.cash_status!=='REVOKING')try {
      branches=await bridge.branches(actor,await credential());
    } catch(issue) {
      if(!(issue instanceof Problem))throw issue;
      options={...options,branchError:'No se pudieron cargar las sucursales.'};
    }
    actor=freshActor();requireThat(actor,'Tu sesión terminó. Ingresa nuevamente.',401);
    const current=teamMember(db,actor,id);
    return {title:current.name,body:memberPage(actor,company,current,branches,{...options,history:teamHistory(db,actor,id)})};
  };
  const notices={access:'Acceso guardado.',permissions:'Permisos guardados.',details:'Datos guardados.',cashier:'Acceso de Caja guardado.',disabled:'Acceso desactivado.',revoked:'Caja retirada.',suspend:'Acceso suspendido.',resume:'Acceso reactivado.',delete:'Persona eliminada. Su historial se conserva.',restore:'Persona restaurada. Genera un código para activar su acceso.'};
  if(method==='GET'&&!action)return render(await memberView({notice:notices[query.get('saved')]||''}));
  requireThat(method==='POST'&&action,'Acción no encontrada.',405);
  try {
    if(action==='access'){limit(db,'loyalty:'+actor.id,40);await saveTeamAccess({db,bridge,wallets},actor,id,data);}
    if(action==='permissions')updateGrants(db,actor,id,data);
    if(action==='details')updateMember(db,actor,id,data);
    if(action==='invite')return render(invitation(id,manageAccount(db,actor,id,'INVITE',data)));
    if(['suspend','resume','delete','restore'].includes(action))changeMemberState(db,actor,id,action.toUpperCase(),data);
    if(action==='disable')manageAccount(db,actor,id,'DISABLE',data);
    if(['disable','delete'].includes(action)&&teamMember(db,actor,id).cash_status==='REVOKING')try {
      await bridge.revoke(actor,id,{revision:String(teamMember(db,actor,id).revision),reason:'Retiro del acceso completo desde Lúmina.',credential});
    } catch(issue) {
      if(!(issue instanceof Problem))throw issue;
      return render(await memberView({notice:'Acceso retirado. Caja está bloqueada en Lúmina; falta confirmar su retiro con Wallet.'},false));
    }
    if(action?.startsWith('cashier/'))limit(db,'loyalty:'+actor.id,40);
    if(action==='cashier/branches')return render(await memberView());
    if(action==='cashier/save')await bridge.configure(actor,id,{...data,credential});
    if(action==='cashier/revoke')await bridge.revoke(actor,id,{...data,credential});
    const notice={disable:'disabled','cashier/save':'cashier','cashier/revoke':'revoked'}[action]||action;
    return redirect(base+'/'+id+'?saved='+notice);
  } catch(issue) {
    if(!(issue instanceof Problem)||![400,409,423,503].includes(issue.status))throw issue;
    const section=action==='cashier/save'?'cashier':action==='cashier/revoke'?'revoke':action;
    const values=issue.localAccessBlocked?{...data,revision:String(issue.committedRevision)}:data;
    const message=issue.localAccessBlocked&&action==='access'?'El cambio de permisos se guardó. '+issue.message:issue.message;
    return render(await memberView({values,error:message,section},issue.status<500),issue.status);
  }
}
