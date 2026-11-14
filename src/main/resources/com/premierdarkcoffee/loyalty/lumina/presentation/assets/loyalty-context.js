'use strict';
(() => {
  const original=window.fetch.bind(window);
  const csrf=document.querySelector('meta[name="lumina-csrf"]').content;
  const prefix=document.querySelector('meta[name=lumina-management]')?'/management-api':'/wallet-api';
  const company=document.querySelector('meta[name="lumina-wallet-company"]')?.content;
  window.fetch=(input,options={})=>{
    const originalUrl=input instanceof Request?input.url:String(input);
    const url=new URL(originalUrl,location.href);
    if(url.origin!==location.origin)return original(input,options);
    if(url.pathname.startsWith('/api/')) {
      const headers=new Headers(input instanceof Request?input.headers:undefined);
      new Headers(options.headers).forEach((value,key)=>headers.set(key,value));
      headers.delete('Authorization');headers.set('X-Lumina-CSRF',csrf);if(company)headers.set('X-Lumina-Company',company);
      return original(prefix+url.pathname+url.search,{...options,headers,credentials:'same-origin'});
    }
    return original(input,options);
  };
})();
