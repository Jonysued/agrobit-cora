// Precache the entire compiled app, including lazy screens and QR scanner chunks.
export function offlineShell() {
  return {
    name: 'lucient-offline-shell', apply: 'build',
    generateBundle(_options, bundle) {
      const assets = [...new Set([...Object.keys(bundle).map(path => '/' + path), '/index.html', '/manifest.json', '/brand/lucient-logo-white.svg', '/brand/lucient-icon.svg', '/brand/lucient-192.png', '/brand/lucient-512.png'])];
      let hash = 0;
      for (const char of Object.keys(bundle).join('|')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      const source = `const SHELL='lucient-shell-${hash}',TILES='lucient-tiles-v1',ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(SHELL).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('lucient-shell-')&&k!==SHELL)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{
 const req=e.request,u=new URL(req.url);if(req.method!=='GET')return;
 if(u.origin===self.location.origin){
  if(req.mode==='navigate'&&!u.pathname.startsWith('/auth/'))e.respondWith(caches.open(SHELL).then(async c=>(await c.match('/index.html'))||fetch(req)));
  else if(ASSETS.includes(u.pathname))e.respondWith(caches.open(SHELL).then(async c=>(await c.match(u.pathname))||fetch(req)));
 }else if(u.hostname==='server.arcgisonline.com'&&u.pathname.includes('/tile/'))e.respondWith((async()=>{
  const c=await caches.open(TILES),saved=await c.match(req);if(saved)return saved;
  try{const response=await fetch(req);if(response.ok||response.type==='opaque'){await c.put(req,response.clone());const keys=await c.keys();for(const k of keys.slice(0,Math.max(0,keys.length-256)))await c.delete(k);}return response;}catch{return new Response('',{status:503});}
 })());
});`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
