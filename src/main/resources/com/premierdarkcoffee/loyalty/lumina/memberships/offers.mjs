import { areas, choice, integer, requireThat, services } from '../shared/domain.mjs';

// New offers use a small vocabulary. Historical service codes remain untouched.
export const offerGroups = Object.freeze({
  SOCIAL: [['VIDEO','Videos'],['PHOTO','Fotografías'],['GRAPHIC','Diseños para redes']],
  WALLET: [['WALLET','Servicio de fidelización']],
  MAPS: [['MAPS_PROFILE','Gestión de Google Maps']],
  WEB: [['WEBSITE','Proyecto web'],['MAINTENANCE','Mantenimiento web']],
  BRAND: [['IDENTITY','Diseño de marca']],
});
export const offerHelp = Object.freeze({
  SOCIAL:'Grabación, fotografía y diseño. El alcance se describe en tu oferta.',
  WALLET:'Configuración o gestión de puntos, sellos, recompensas y tarjetas. El espacio Wallet ya está activo.',
  MAPS:'Agrupa aquí información, fotos, reseñas y seguimiento. Detalla lo incluido en la descripción.',
  WEB:'El proyecto puede ser una página, tienda, catálogo, menú o reservas. Descríbelo sin crear otro tipo de servicio.',
  BRAND:'Logo, identidad y aplicaciones de marca, según el alcance acordado. Se contrata por trabajo.',
});
export const offerCodes = Object.values(offerGroups).flat().map(([code])=>code);
export function normalizeOffer(data) {
  if(data.catalog_version!=='SIMPLE')return data;
  const selection=Object.fromEntries(offerCodes.map(code=>[code,integer(data[code]||'0',services[code],{max:100})]));
  requireThat(Object.entries(data).every(([key,value])=>!Object.hasOwn(services,key)||offerCodes.includes(key)||!value||value==='0'),
    'Elige los servicios de este formulario. Los registros anteriores se conservan.');
  requireThat(Object.values(selection).some(n=>n>0),'Selecciona al menos un servicio y su cantidad.');
  requireThat(selection.WALLET<=1,'Incluye un solo servicio de Wallet por oferta.');
  requireThat(!data.wallet_gift||data.wallet_gift==='yes','Revisa la cortesía de Wallet.');
  requireThat(data.wallet_gift!=='yes'||selection.WALLET===1&&Object.entries(selection).some(([c,n])=>c!=='WALLET'&&n>0),
    'La cortesía de Wallet debe acompañar otro servicio del paquete.');
  const priceType=choice(data.price_type,['FIXED','QUOTE'],'precio');
  requireThat(priceType!=='FIXED'||typeof data.price==='string'&&data.price.trim()!=='','Escribe el precio total de la oferta.');
  requireThat(data.confirm_offer==='yes','Revisa las cantidades y el precio antes de publicar.');
  return {...data,...Object.fromEntries(Object.keys(services).map(c=>[c,String(selection[c]||0)])),offer_kind:'BUNDLE',
    price:priceType==='QUOTE'?'':data.price,wallet:selection.WALLET?(data.wallet_gift==='yes'?'GIFT':'INCLUDED'):'NONE'};
}

export const offerAreaOptions=Object.entries(areas);
