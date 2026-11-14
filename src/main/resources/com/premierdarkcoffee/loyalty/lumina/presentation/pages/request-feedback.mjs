import { esc, form, hidden, localLink } from './components.mjs';

// Recovery belongs to the exact operation and object, never to every form on a page.
export function formState(feedback, action, identity = {}) {
  const failed = feedback?.action === action &&
    Object.entries(identity).every(([key,value]) => feedback.values[key] === value);
  return {
    failed,
    value: (key, initial = '') => failed ? feedback.values[key] ?? '' : initial,
    error: failed ? feedback.error : '',
  };
}
export function operationForm(actor, action, body, state, currentUrl, css = '') {
  const error = state.failed ? `<div class="detail-error" role="alert" tabindex="-1" data-detail-error><strong>No se guardó este cambio</strong><p>${esc(state.error)}</p>${localLink(currentUrl,'Revisar versión actual')}</div>` : '';
  return form(action,actor,error+body,'detail-form '+css);
}
export function operationPanel(caption, body, state, id, open = false) {
  return `<details class="disclosure detail-operation" id="${esc(id)}"${open || state.failed ? ' open' : ''}><summary>${esc(caption)}</summary><div>${body}</div></details>`;
}
export const revisionField = (state, revision) => hidden('revision',state.value('revision',revision));
