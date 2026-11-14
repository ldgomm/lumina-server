// Fictional browser DOM only; visual viewport checks are performed separately.
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {JSDOM} = require(process.env.LOYALTY_TEST_JSDOM || 'jsdom');
const script=readFileSync(resolve(__dirname,'../../src/main/resources/com/premierdarkcoffee/loyalty/lumina/presentation/assets/homepage.js'),'utf8');
const dom=new JSDOM('<main><details class="mobile-menu"><summary>Menú</summary><nav><a href="#services"><span>Servicios</span></a></nav></details><section id="services">Servicios</section></main>',{url:'https://lumina.test/',runScripts:'outside-only'});
const {window}=dom,menu=window.document.querySelector('details'),summary=menu.querySelector('summary');
window.eval(script);
menu.open=true;menu.querySelector('span').click();assert.equal(menu.open,false);assert.equal(menu.querySelector('a').getAttribute('href'),'#services');
menu.open=true;menu.querySelector('a').focus();window.document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(menu.open,false);assert.equal(window.document.activeElement,summary);
menu.open=true;window.document.querySelector('section').click();assert.equal(menu.open,false);
menu.open=true;summary.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(menu.open,true);
assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);dom.window.close();
const plain=new JSDOM('<body><a href="/login">Ingresar</a></body>',{runScripts:'outside-only'});assert.doesNotThrow(()=>plain.window.eval(script));plain.window.close();
console.log('LUMINA_HOMEPAGE_DOM_PASS');
