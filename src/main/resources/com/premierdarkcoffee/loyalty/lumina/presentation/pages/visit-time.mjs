import { localDay, zone } from '../../shared/domain.mjs';

const dateFormat=new Intl.DateTimeFormat('es-EC',{timeZone:zone,weekday:'long',day:'numeric',month:'long',year:'numeric'});
const timeFormat=new Intl.DateTimeFormat('es-EC',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function visitTime(value,current=new Date()) {
  const date=new Date(value),day=localDay(date),today=localDay(current),tomorrow=localDay(new Date(current.getTime()+86400000));
  return {day,date:dateFormat.format(date),relative:day===today?'Hoy':day===tomorrow?'Mañana':'',time:timeFormat.format(date)};
}
