// Interaction checks use the production markup with a local document and no network.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const presentation = resolve(__dirname, '../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation');
const script = readFileSync(resolve(presentation, 'assets/homepage.js'), 'utf8');

async function run() {
  const { homepage } = await import(pathToFileURL(resolve(presentation, 'pages/homepage.mjs')));
  const dom = new JSDOM(homepage(), { url: 'https://lumina.test/', runScripts: 'outside-only' });
  const { window } = dom;
  const { document } = window;
  const menu = document.querySelector('details.mobile-menu');
  const summary = menu.querySelector('summary');
  const services = menu.querySelector('a[href="#services"]');
  const demo = document.querySelector('[data-visit-demo]');
  const status = document.querySelector('[data-visit-status]');
  assert.equal(demo.hidden, true);
  assert.equal(status.textContent, '4 de 5 sellos');
  assert.equal(status.getAttribute('aria-live'), 'polite');
  assert.equal(document.querySelector('.hero a[href="/register"]').textContent.includes('Pedir mi video gratis'), true);
  for (const element of document.querySelectorAll('[aria-labelledby]')) {
    for (const id of element.getAttribute('aria-labelledby').split(/\s+/)) assert.ok(document.getElementById(id), id);
  }
  window.eval(script);
  assert.equal(demo.hidden, false);
  menu.open = true;
  services.click();
  assert.equal(menu.open, false);
  menu.open = true;
  services.focus();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(menu.open, false);
  assert.equal(document.activeElement, summary);
  menu.open = true;
  summary.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(menu.open, true);
  document.querySelector('h1').click();
  assert.equal(menu.open, false);

  demo.focus();
  demo.click();
  assert.match(status.textContent, /Premio disponible.*5 de 5 sellos/);
  assert.equal(document.activeElement, demo);
  assert.equal(demo.textContent.trim(), 'Volver a probar');
  demo.click();
  assert.equal(status.textContent, '4 de 5 sellos');
  assert.equal(demo.textContent.trim(), 'Simular una visita');
  assert.equal(window.localStorage.length, 0);
  assert.equal(window.sessionStorage.length, 0);
  window.close();

  const plain = new JSDOM('<body><a href="/login">Ingresar</a></body>', { runScripts: 'outside-only' });
  assert.doesNotThrow(() => plain.window.eval(script));
  plain.window.close();
  console.log('LUMINA_HOMEPAGE_DOM_PASS');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
