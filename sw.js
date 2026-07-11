// sw.js — PesoDigiuno
// Cache dell'app shell per permettere l'apertura offline. Le chiamate verso
// Supabase (API dati) NON vengono mai intercettate: passano sempre dritte
// alla rete, la logica offline-first dei dati resta gestita in index.html
// (localStorage + coda di sync). Questo service worker si occupa solo di
// far *aprire* l'app anche senza connessione.
//
// Bump manuale della cache quando si cambia questo file o si vuole forzare
// un refresh dell'app shell nei client già installati.
const CACHE_NAME = "pesodigiuno-shell-v1";

// Risorse note dell'app shell, precaricate all'installazione.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

// Host da NON toccare mai: dati live, devono sempre andare in rete.
const NEVER_CACHE_HOST = "supabase.co";

self.addEventListener("install", (event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache)=>{
      // Precache "best effort": se una risorsa fallisce (es. manifest.json
      // non ancora presente) non deve bloccare l'installazione delle altre.
      return Promise.all(
        PRECACHE_URLS.map((url)=>
          cache.add(url).catch((err)=> console.warn("[sw] precache saltata:", url, err))
        )
      );
    }).then(()=> self.skipWaiting())
  );
});

self.addEventListener("activate", (event)=>{
  event.waitUntil(
    caches.keys().then((names)=>
      Promise.all(names.filter((n)=> n !== CACHE_NAME).map((n)=> caches.delete(n)))
    ).then(()=> self.clients.claim())
  );
});

self.addEventListener("fetch", (event)=>{
  const req = event.request;
  if(req.method !== "GET") return; // scritture: mai intercettate

  let url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if(url.hostname.endsWith(NEVER_CACHE_HOST)) return; // dati Supabase: sempre in rete

  // Navigazione (apertura app): cache-first per garantire l'avvio offline,
  // ma aggiorna la cache in background quando la rete c'è (stale-while-revalidate).
  if(req.mode === "navigate"){
    event.respondWith(
      caches.match("./index.html").then((cached)=>{
        const network = fetch(req).then((res)=>{
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c)=> c.put("./index.html", copy));
          }
          return res;
        }).catch(()=> cached);
        return cached || network;
      })
    );
    return;
  }

  // Tutto il resto (CSS/JS CDN, manifest, icone, font): cache-first con
  // aggiornamento in background, e fallback alla rete se non in cache.
  event.respondWith(
    caches.match(req).then((cached)=>{
      const network = fetch(req).then((res)=>{
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c)=> c.put(req, copy));
        }
        return res;
      }).catch(()=> cached);
      return cached || network;
    })
  );
});
