import { event, isId, requireThat } from '../shared/domain.mjs';

export function createWalletOnboarding({db,remote,configured}) {
  const pending=new Map();
  async function provision(companyId) {
    const company=db.get('SELECT * FROM companies WHERE id=?',companyId);
    requireThat(company,'Negocio no encontrado.',404);
    if(company.loyalty_tenant)return company;
    const owner=db.get("SELECT id,name,email FROM accounts WHERE company_id=? AND kind='OWNER' AND active=1",companyId);
    requireThat(owner,'El negocio no tiene un responsable activo.',409);
    const result=await remote('/api/platform/lumina/businesses',{method:'POST',token:configured(),body:{
      companyId:company.id,name:company.name,contactName:owner.name,email:owner.email,phone:company.phone,
    }});
    requireThat(result.companyId===company.id && isId(result.business?.id) && typeof result.business.name==='string' &&
      result.business.slug==='lumina-'+company.id.replaceAll('-',''),'No se pudo verificar el Wallet de este negocio.',502);
    return db.transaction(()=>{
      const current=db.get('SELECT * FROM companies WHERE id=?',company.id);
      requireThat(current && (!current.loyalty_tenant || current.loyalty_tenant===result.business.id),'La asociación del negocio cambió durante el alta.',409);
      requireThat(!db.get('SELECT id FROM companies WHERE loyalty_tenant=? AND id<>?',result.business.id,company.id),'El Wallet pertenece a otro registro.',409);
      if(!current.loyalty_tenant){
        db.run('UPDATE companies SET loyalty_tenant=?,loyalty_name=? WHERE id=?',result.business.id,result.business.name,company.id);
        event(db,{id:owner.id,name:'Lúmina Digital'},company.id,'COMPANY',company.id,'WALLET_ACTIVADO','Espacio propio creado con la información del registro.','WALLET');
      }
      return db.get('SELECT * FROM companies WHERE id=?',company.id);
    });
  }
  return async companyId=>{
    requireThat(isId(companyId),'Negocio no encontrado.',404);
    if(!pending.has(companyId))pending.set(companyId,provision(companyId).finally(()=>pending.delete(companyId)));
    return pending.get(companyId);
  };
}
