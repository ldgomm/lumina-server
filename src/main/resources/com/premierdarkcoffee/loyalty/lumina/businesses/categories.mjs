import { readFileSync } from 'node:fs';
import { requireThat } from '../shared/domain.mjs';
export const businessCategories = JSON.parse(readFileSync(new URL('../../businesses/business-categories.json',import.meta.url),'utf8'));
export function businessCategory(value) {
  // Missing category remains compatible with old registration clients.
  const category=String(value||'GENERAL');
  requireThat(businessCategories.some(c=>c.id===category),'Selecciona el tipo de negocio.');
  return category;
}
