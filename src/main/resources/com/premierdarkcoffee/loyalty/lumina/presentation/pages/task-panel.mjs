import { esc } from './components.mjs';
import { icon } from './icons.mjs';

export function taskPanel({area,mark,label,title,description,action,href}) {
  return `<section class="task-panel" data-area="${esc(area)}"><div class="task-body"><p class="task-label">${icon(mark)} ${esc(label)}</p>
    <h2>${esc(title)}</h2><p class="task-description">${esc(description)}</p>
    ${href?`<a class="task-action" href="${esc(href)}">${esc(action)} ${icon('arrow')}</a>`:''}</div></section>`;
}
