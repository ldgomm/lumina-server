import {requireAgency} from '../access/accounts.mjs';
import {operatingSql, requestBusinessSql} from '../businesses/operation-state.mjs';
import {channels, integer, requireThat, text} from '../shared/domain.mjs';

export const productionStates=Object.freeze({NEW:'Por revisar',REVIEW:'En revisión',QUOTED:'Cotizadas',APPROVED:'Aprobadas',SCHEDULED:'Agendadas',PRODUCTION:'En producción',DELIVERED:'Entregadas',CANCELLED:'Canceladas'});

export function agencyProductionData(db,actor,params) {
  requireAgency(actor);
  const q=text(params.get('q')||'','búsqueda',0,100);
  const scope=params.get('scope')||'operating',state=params.get('state')||'',channel=params.get('channel')||'';
  const sort=params.get('sort')||'recent',requested=integer(params.get('page')||'0','página',{max:100000});
  requireThat(['operating','blocked'].includes(scope),'Vista de producción no disponible.');
  requireThat(!state || Object.hasOwn(productionStates,state),'Estado de solicitud inválido.');
  requireThat(!channel || Object.hasOwn(channels,channel),'Canal inválido.');
  requireThat(['recent','oldest'].includes(sort),'Orden de producción no disponible.');
  const from=`FROM requests r JOIN companies c ON c.id=r.company_id WHERE ${scope==='blocked'?'NOT ':''}${operatingSql()}
    AND instr(search_text(r.title||' '||c.name),search_text(?))>0 AND (?='' OR r.status=?) AND (?='' OR r.channel=?)`;
  const values=[q,state,state,channel,channel];
  const total=db.get(`SELECT count(*) AS n ${from}`,...values).n;
  const page=Math.min(requested,Math.max(0,Math.ceil(total/20)-1));
  const direction=sort==='oldest'?'ASC':'DESC';
  const rows=db.all(`SELECT r.*,${requestBusinessSql},c.name AS company_name ${from}
    ORDER BY r.created_at ${direction},r.id ${direction} LIMIT 20 OFFSET ?`,...values,page*20);
  return {rows,q,scope,state,channel,sort,total,page};
}
