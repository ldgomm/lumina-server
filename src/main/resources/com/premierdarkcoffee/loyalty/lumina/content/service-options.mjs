// Customer language is intentionally smaller than the historical production catalog.
// Stored formats and contract balances retain their original identifiers.
export const contentOptions = Object.freeze([['VIDEO','Video'],['PHOTO','Fotografías'],['GRAPHIC','Diseño para redes']]);
const families = Object.freeze({VIDEO:['VIDEO','REEL','SHORT','EDITING'],PHOTO:['PHOTO'],GRAPHIC:['GRAPHIC','POST','CAROUSEL','STORY','COPY','PUBLICATION']});
export const contentKind = service => Object.keys(families).find(key=>families[key].includes(service)) || service;
export const contentName = service => contentOptions.find(([key])=>key===contentKind(service))?.[1] || service;
export const compatibleContentQuota = (requested,allocated) => requested===allocated || contentKind(requested)===contentKind(allocated);
