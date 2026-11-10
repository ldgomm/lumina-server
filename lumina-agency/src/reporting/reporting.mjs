import { can, requireAccess, requireAgency } from '../accounts/accounts.mjs';
import { choice, dateOnly, event, httpsUrl, integer, localDay, localInstant, money, now, requireThat, socialChannels, text, uuid } from '../domain.mjs';

export const metrics = Object.freeze({ views:'Vistas', likes:'Me gusta', comments:'Comentarios', shares:'Compartidos', reach:'Alcance' });
const metricsKeys = Object.keys(metrics);
export function publicationsFor(db, actor, companyId, pieceId) {
  return db.all('SELECT * FROM publications WHERE company_id=? AND piece_id=? ORDER BY published_at,id',companyId,pieceId)
    .filter(pub => can(actor,pub.channel))
    .map(pub => ({...pub, metrics: db.all(`SELECT * FROM social_metrics
      WHERE company_id=? AND publication_id=? ORDER BY observed_at DESC LIMIT 20`,companyId,pub.id) }));
}
export function addSocialMetric(db, actor, company, request, piece, input) {
  requireAgency(actor);
  const pub = db.get('SELECT * FROM publications WHERE id=? AND company_id=? AND piece_id=?',
    input.publication || '',company.id,piece.id);
  requireThat(pub,'Publicación no encontrada.',404);
  const observed = localInstant(input.observed,'fecha de medición');
  requireThat(observed >= pub.published_at && observed <= now(),'La medición debe estar entre la publicación y el momento actual.');
  const values = metricsKeys.map(key => integer(input[key],metrics[key],{optional:true}));
  requireThat(values.some(value => value !== null),'Registra al menos una métrica.');
  const notes = text(input.notes || '','observaciones',0,1000);
  db.transaction(() => {
    requireThat(!db.get('SELECT id FROM social_metrics WHERE company_id=? AND publication_id=? AND observed_at=?',
      company.id,pub.id,observed),'Ya existe un corte en ese momento.',409);
    db.run("INSERT INTO social_metrics VALUES(?,?,?,?,?,?,?,?,?,?,'MANUAL')",uuid(),company.id,pub.id,observed,...values,notes);
    event(db,actor,company.id,'REQUEST',request.id,'MÉTRICAS_REGISTRADAS','',request.channel);
  });
}
export function analytics(db, actor, companyId, filters) {
  const defaultFrom = localDay(new Date(Date.now() - 29 * 86400000));
  const from = dateOnly(filters.from || defaultFrom,'la fecha inicial');
  const to = dateOnly(filters.to || localDay(),'la fecha final');
  requireThat(from <= to && to <= localDay(),'Revisa el período de análisis.');
  const start = localInstant(from + 'T00:00','inicio');
  const end = new Date(Date.parse(localInstant(to + 'T00:00','fin')) + 86400000).toISOString();
  const channels = socialChannels.filter(channel => can(actor,channel));
  const summary = new Map(channels.map(channel => [channel,{channel,publications:0,measured:0,values:{},changes:{},coverage:{}}]));
  for (const item of summary.values()) {
    for (const key of metricsKeys) {
      item.values[key] = 0n;
      item.changes[key] = 0n;
      item.coverage[key] = {observed:0,comparable:0};
    }
  }
  const pairs = db.all(`SELECT b.channel,r.channel AS request_channel,r.type AS request_type,
    m.id AS current_id,m.views,m.likes,m.comments,m.shares,m.reach,m.observed_at,
    p.views AS prev_views,p.likes AS prev_likes,p.comments AS prev_comments,
    p.shares AS prev_shares,p.reach AS prev_reach
    FROM publications b JOIN pieces x ON x.company_id=b.company_id AND x.id=b.piece_id
    JOIN requests r ON r.company_id=x.company_id AND r.id=x.request_id
    LEFT JOIN social_metrics m ON m.id=(SELECT id FROM social_metrics WHERE company_id=b.company_id
      AND publication_id=b.id AND source='MANUAL' AND observed_at>=? AND observed_at<? ORDER BY observed_at DESC LIMIT 1)
    LEFT JOIN social_metrics p ON p.id=(SELECT id FROM social_metrics WHERE company_id=b.company_id
      AND publication_id=b.id AND source='MANUAL' AND observed_at<? ORDER BY observed_at DESC LIMIT 1)
    WHERE b.company_id=? AND b.published_at<? AND x.status<>'CANCELLED'`,start,end,start,companyId,end);
  for (const row of pairs) {
    const result = summary.get(row.channel);
    if (!result || !can(actor,row.request_channel) ||
      (actor.kind === 'COLLABORATOR' && ['PLAN','QUOTE','COURTESY'].includes(row.request_type))) continue;
    result.publications++;
    if (!row.current_id) continue;
    result.measured++;
    for (const key of metricsKeys) {
      if (row[key] === null) continue;
      result.values[key] += BigInt(row[key]);
      result.coverage[key].observed++;
      if (row['prev_' + key] === null) continue;
      result.changes[key] += BigInt(row[key]) - BigInt(row['prev_' + key]);
      result.coverage[key].comparable++;
    }
  }
  return { from, to, rows: [...summary.values()] };
}
function mapsLocation(db, companyId, id) {
  const location = db.get('SELECT * FROM maps_locations WHERE company_id=? AND id=?',companyId,id || '');
  requireThat(location,'Ubicación no encontrada.',404);
  return location;
}
export function mapsData(db, actor, companyId) {
  requireAccess(actor,'MAPS');
  return db.all('SELECT * FROM maps_locations WHERE company_id=? ORDER BY name,id',companyId).map(location => ({
    ...location,
    cuts: db.all('SELECT * FROM maps_metrics WHERE company_id=? AND location_id=? ORDER BY observed_at DESC LIMIT 20',
      companyId,location.id),
    reviews: db.all('SELECT * FROM maps_reviews WHERE company_id=? AND location_id=? ORDER BY reviewed_on DESC,id LIMIT 30',
      companyId,location.id),
  }));
}
export function addLocation(db, actor, company, data) {
  requireAgency(actor);
  const name = text(data.name,'ubicación',2,120);
  const url = httpsUrl(data.url);
  db.transaction(() => {
    requireThat(!db.get('SELECT id FROM maps_locations WHERE company_id=? AND url=?',company.id,url),
      'Ya existe esa ubicación.',409);
    const id = uuid();
    db.run('INSERT INTO maps_locations VALUES(?,?,?,?)',id,company.id,name,url);
    event(db,actor,company.id,'MAPS',id,'UBICACIÓN_REGISTRADA',name,'MAPS');
  });
}
export function addMapsMetric(db, actor, company, data) {
  requireAgency(actor);
  const location = mapsLocation(db,company.id,data.location);
  const observed = localInstant(data.observed,'fecha de medición');
  requireThat(observed <= now(),'La medición no puede estar en el futuro.');
  const count = integer(data.count,'número de reseñas');
  const rating = money(data.rating,true);
  requireThat(count === 0 ? rating === null : rating >= 100 && rating <= 500,
    'Ingresa una calificación de 1 a 5 si la ubicación tiene reseñas.');
  const notes = text(data.notes || '','observaciones',0,1000);
  db.transaction(() => {
    requireThat(!db.get('SELECT id FROM maps_metrics WHERE company_id=? AND location_id=? AND observed_at=?',
      company.id,location.id,observed),'Ya existe un corte en ese momento.',409);
    db.run('INSERT INTO maps_metrics VALUES(?,?,?,?,?,?,?)',uuid(),company.id,location.id,observed,rating,count,notes);
    event(db,actor,company.id,'MAPS',location.id,'CORTE_DE_RESEÑAS','', 'MAPS');
  });
}
export function addReview(db, actor, company, data) {
  requireAgency(actor);
  const location = mapsLocation(db,company.id,data.location);
  const stars = integer(data.stars,'estrellas',{min:1,max:5});
  const reviewedOn = dateOnly(data.date,'la fecha de la reseña');
  requireThat(reviewedOn <= localDay(),'La reseña no puede estar en el futuro.');
  const reference = text(data.reference,'referencia de la reseña',2,400);
  const summary = text(data.summary || '','resumen',0,1500);
  const response = text(data.response || '','respuesta',0,1500);
  const status = choice(data.status,['PENDING','DRAFT','ANSWERED'],'estado de la respuesta');
  db.transaction(() => {
    const existing = db.get('SELECT id FROM maps_reviews WHERE company_id=? AND location_id=? AND reference=?',
      company.id,location.id,reference);
    if (existing) {
      db.run('UPDATE maps_reviews SET stars=?,reviewed_on=?,summary=?,response=?,status=? WHERE id=?',
        stars,reviewedOn,summary,response,status,existing.id);
    } else {
      db.run('INSERT INTO maps_reviews VALUES(?,?,?,?,?,?,?,?,?)',uuid(),company.id,location.id,stars,reviewedOn,reference,summary,response,status);
    }
    event(db,actor,company.id,'MAPS',location.id,existing ? 'RESEÑA_ACTUALIZADA' : 'RESEÑA_REGISTRADA','', 'MAPS');
  });
}
