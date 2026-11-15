import { requireAgency, requireBusinessActor } from '../access/accounts.mjs';
import { requestAccessSql } from '../access/content-policy.mjs';
import { isId, requireThat } from '../shared/domain.mjs';

// A private snapshot, never a public feed or an invitation to another person.
export function calendarVisit(db,actor,companyId,id) {
  if(actor.kind==='AGENCY')requireAgency(actor);
  else requireBusinessActor(actor,{id:companyId});
  requireThat(isId(id),'Grabación no encontrada.',404);
  const policy=requestAccessSql(actor);
  const row=db.get(`SELECT v.*,r.title,r.status request_status,c.name company_name
    FROM visits v JOIN requests r ON r.company_id=v.company_id AND r.id=v.request_id
    JOIN companies c ON c.id=v.company_id
    WHERE v.id=? AND (?='' OR v.company_id=?) AND ${policy.sql}`,id,companyId||'',companyId||'',...policy.params);
  requireThat(row,'Grabación no encontrada.',404);
  requireThat(row.status==='SCHEDULED'&&row.request_status!=='CANCELLED','Esta visita ya no está programada. Revisa la agenda.',409);
  return row;
}

function calendarText(value) {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu,'')
    .replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
function calendarDate(value) {
  const date=new Date(value);
  requireThat(Number.isFinite(date.getTime()),'Revisa la fecha de la grabación.',409);
  return date.toISOString().slice(0,19).replace(/[-:]/g,'')+'Z';
}
function folded(line) {
  const lines=[];let current='',bytes=0;
  // RFC5545: at most75 octets per physical line, without splitting a UTF-8 code point.
  for(const character of line) {
    const length=Buffer.byteLength(character);
    if(bytes+length>75){lines.push(current);current=' ';bytes=1;}
    current+=character;bytes+=length;
  }
  lines.push(current);return lines.join('\r\n');
}
export function visitCalendar(row,generatedAt=new Date()) {
  requireThat(isId(row.id),'Grabación no encontrada.',404);
  const revision=Number(row.revision);
  requireThat(Number.isSafeInteger(revision)&&revision>=0,'Revisa la grabación.',409);
  return [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lumina Digital//Recording Agenda//ES','CALSCALE:GREGORIAN',
    'BEGIN:VEVENT','UID:'+row.id+'@lumina','DTSTAMP:'+calendarDate(generatedAt),
    'SEQUENCE:'+revision,'DTSTART:'+calendarDate(row.starts_at),
    'SUMMARY:'+calendarText('Grabación · '+row.title),'LOCATION:'+calendarText(row.place),
    'DESCRIPTION:'+calendarText(row.company_name+'\nHora de Ecuador continental. Consulta Lúmina para ver cambios. Esta copia no se actualiza automáticamente.'),
    'STATUS:CONFIRMED','CLASS:PRIVATE','TRANSP:TRANSPARENT','END:VEVENT','END:VCALENDAR',
  ].map(folded).join('\r\n')+'\r\n';
}
