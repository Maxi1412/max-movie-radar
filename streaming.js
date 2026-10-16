/* MAX Movie Radar — streaming discovery sourced from TMDb/JustWatch.
   Catalog is built server-side; no API credentials are exposed in this PWA.
   Availability is country-specific; provider availability is NOT a debut date. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = (s='') => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const img = p => typeof p==='string' && /^\/[\w./-]+$/.test(p) ? 'https://image.tmdb.org/t/p/w500'+p : '';
  const COUNTRY = {US:'United States',GB:'United Kingdom',ES:'Spain',AU:'Australia'};
  const STORE = 'max-movie-radar:v1:streaming';
  const read = () => {try {const x=JSON.parse(localStorage.getItem(STORE)||'{}');return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return {}}};
  const savedData = read();
  const state = {catalog:[],feed:null,ready:false,region:'ALL',media:'all',provider:'all',q:'',mode:'browse',
    saved:savedData.saved&&typeof savedData.saved==='object'?savedData.saved:{},
    baseline:savedData.baseline&&typeof savedData.baseline==='object'?savedData.baseline:{},
    alerts:Array.isArray(savedData.alerts)?savedData.alerts:[],open:null,request:false};
  function persist(){
    try{localStorage.setItem(STORE,JSON.stringify({saved:state.saved,baseline:state.baseline,alerts:state.alerts}))}
    catch{announce('Unable to save. Check local browser storage.');}
  }
  const ident = x => x.media_type+':'+x.id;
  const compact = x => ({id:x.id,media_type:x.media_type,title:x.title,year:x.year,poster_path:x.poster_path,
                       providers:x.providers,overview:x.overview,date:x.date});
  const curr = x => state.saved[ident(x)]||null;
  function announce(message){const el=$('stream-message');el.textContent=message;el.hidden=false;clearTimeout(announce.timer);announce.timer=setTimeout(()=>el.hidden=true,4600)}
  function normalize(x){
    if(!x || !['movie','tv'].includes(x.media_type)||!Number.isInteger(x.id)||x.id<1||!x.title)return null;
    const providers={};
    for(const region of Object.keys(COUNTRY)){
      const list=x.providers?.[region];
      if(!Array.isArray(list))continue;
      providers[region]=list.filter(p=>Number.isInteger(p?.id)&&p.id>0&&typeof p.name==='string')
        .map(p=>({id:p.id,name:String(p.name),logo:p.logo||null,type:String(p.type||'subscription')}));
    }
    if(!Object.keys(providers).some(r=>providers[r].length))return null;
    return {...x, title:String(x.title), media_type:x.media_type, providers,
      poster_path:x.poster_path||null,overview:String(x.overview||''),year:String(x.year||''),
      genres:Array.isArray(x.genres)?x.genres.map(String):[],popularity:Number(x.popularity)||0};
  }
  function providerList(x){return state.region==='ALL'
    ? Object.values(x.providers||{}).flat()
    : x.providers?.[state.region]||[]}
  function matchingProvider(x){return state.provider==='all'||providerList(x).some(p=>p.id===Number(state.provider))}
  function currentItems(){
    const search=state.q.trim().toLocaleLowerCase();
    const incoming=state.mode==='saved'
      ? Object.values(state.saved).filter(v=>v?.saved).map(v=>v.snapshot).filter(Boolean).map(normalize).filter(Boolean)
      : state.catalog;
    return incoming.filter(x=>{
      if(state.media!=='all'&&x.media_type!==state.media)return false;
      if(state.region!=='ALL'&&!(x.providers?.[state.region]||[]).length)return false;
      if(!matchingProvider(x))return false;
      if(search&&!(x.title+' '+x.overview+' '+(x.genres||[]).join(' ')).toLocaleLowerCase().includes(search))return false;
      return true;
    }).sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.popularity-a.popularity);
  }
  function usedServices(){
    const count=new Map();
    for(const x of state.catalog){
      if(state.region!=='ALL'&&!(x.providers?.[state.region]||[]).length)continue;
      if(state.media!=='all'&&state.media!==x.media_type)continue;
      for(const p of providerList(x)){
        const row=count.get(p.id)||{id:p.id,name:p.name,n:0};row.n++;count.set(p.id,row);
      }
    }
    return [...count.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name));
  }
  function renderOptions(){
    const el=$('stream-provider'), old=state.provider;
    const services=usedServices();
    el.innerHTML='<option value="all">All streaming platforms</option>'+
      services.map(p=>'<option value="'+p.id+'">'+esc(p.name)+' ('+p.n+')</option>').join('');
    if(old!=='all'&&!services.some(s=>String(s.id)===old))state.provider='all';
    el.value=state.provider;
  }
  function providerNames(x){
    const unique=new Map();for(const p of providerList(x))if(!unique.has(p.id))unique.set(p.id,p);
    return [...unique.values()];
  }
  function card(x){
    const p=img(x.poster_path),s=curr(x),all=providerNames(x).slice(0,3);
    return '<article class="stream-card" tabindex="0" role="button" data-stream-item="'+esc(ident(x))+'">'+
      '<div class="stream-poster"><div class="stream-fallback">'+esc(x.title)+'</div>'+
      (p?'<img src="'+p+'" alt="'+esc(x.title)+' poster" loading="lazy" decoding="async" onerror="this.style.display=\'none\'">':'')+
      '<span class="stream-type">'+(x.media_type==='movie'?'MOVIE':'TV SHOW')+'</span>'+
      '<button type="button" class="stream-heart '+(s?.liked?'is-liked':'')+'" data-stream-like="'+esc(ident(x))+'" title="Like '+esc(x.title)+'" aria-pressed="'+!!s?.liked+'">'+(s?.liked?'♥':'♡')+'</button></div>'+
      '<strong class="stream-card-name">'+esc(x.title)+'</strong>'+
      '<div class="stream-card-meta">'+esc(x.year||'')+(x.rating?' · ★ '+Number(x.rating).toFixed(1):'')+'</div>'+
      '<div class="stream-platforms">'+all.map(p=>'<span>'+esc(p.name)+'</span>').join('')+
      (providerNames(x).length>3?'<span>+'+(providerNames(x).length-3)+'</span>':'')+'</div>'+
      (s?.saved?'<small class="stream-saved-state">✓ In Streaming Saved</small>':'')+
      '</article>';
  }
  function scanUpdates(data){
    const now=new Date().toISOString();
    // Detect listing changes for SAVED titles only. This does NOT establish an
    // actual service-premiere date: TMDb entries may be edited retrospectively.
    for(const x of state.catalog){
      const id=ident(x),s=state.saved[id];
      if(!s?.saved)continue;
      const fresh={};for(const region of Object.keys(COUNTRY))fresh[region]=(x.providers[region]||[]).map(p=>p.id).sort((a,b)=>a-b);
      const before=state.baseline[id];
      if(before&&typeof before==='object'){
        for(const region of Object.keys(COUNTRY)){
          const previous=new Set(before[region]||[]);
          for(const p of x.providers?.[region]||[]){
            if(previous.has(p.id))continue;
            const key=id+':'+region+':'+p.id;
            if(!state.alerts.some(a=>a.key===key))
              state.alerts.push({key,id,title:x.title,provider:p.name,region,when:now});
          }
        }
      }
      state.baseline[id]=fresh;
      s.snapshot=compact(x);
    }
    state.alerts=state.alerts.slice(-100);
    persist();
  }
  function render(){
    renderOptions();
    const items=currentItems();
    $('stream-grid').innerHTML=items.map(card).join('');
    $('stream-count').textContent=items.length;
    $('stream-saved-count').textContent=Object.values(state.saved).filter(v=>v?.saved).length;
    $('stream-alert-count').textContent=state.alerts.length;
    $('stream-alert-count').hidden=!state.alerts.length;
    $('stream-empty').hidden=items.length>0;
    $('stream-empty').textContent=state.ready?'Nothing matches these filters. Try All platforms or All countries.':'The streaming feed has not been published yet.';
    $('stream-last-updated').textContent=state.feed?.generated_at?
      'Provider listings checked '+new Date(state.feed.generated_at).toLocaleDateString('en-GB'):'Waiting for data';
    document.querySelectorAll('[data-stream-mode]').forEach(b=>b.classList.toggle('is-active',b.dataset.streamMode===state.mode));
    document.querySelectorAll('[data-stream-media]').forEach(b=>b.classList.toggle('is-active',b.dataset.streamMedia===state.media));
    $('stream-region').value=state.region;
  }
  function toggleSave(x,field){
    const id=ident(x),s=state.saved[id]||{saved:false,liked:false,snapshot:compact(x)};
    s.snapshot=compact(x);s[field]=!s[field];
    if(!s.saved&&!s.liked){delete state.saved[id];delete state.baseline[id];}
    else {state.saved[id]=s;if(s.saved&&!state.baseline[id]){
      state.baseline[id]={};for(const region of Object.keys(COUNTRY))state.baseline[id][region]=(x.providers?.[region]||[]).map(p=>p.id);
    }}
    persist();render();
    if($('stream-dialog').open)openItem(id);
    announce(x.title+(s[field]?' added':' removed')+(field==='saved'?' to Streaming Saved':' to your Likes'));
  }
  function openItem(id){
    const x=state.catalog.find(item=>ident(item)===id)||
      Object.values(state.saved).map(v=>v?.snapshot).filter(Boolean).map(normalize).find(item=>item&&ident(item)===id);
    if(!x)return;state.open=id;
    const saved=curr(x),p=img(x.poster_path);
    const countries=state.region==='ALL'?Object.keys(COUNTRY):[state.region];
    const sections=countries.filter(c=>(x.providers?.[c]||[]).length).map(c=>'<div class="stream-country">'+
      '<h4>'+COUNTRY[c]+'</h4><div class="stream-providers">'+x.providers[c].map(service=>
        '<span class="stream-provider">'+(img(service.logo)?'<img src="'+img(service.logo)+'" alt="" loading="lazy">':'')+
        '<span>'+esc(service.name)+'<small>'+esc(service.type)+'</small></span></span>').join('')+'</div></div>').join('');
    $('stream-dialog-body').innerHTML='<div class="stream-detail-top">'+
      (p?'<img class="stream-detail-poster" src="'+p+'" alt="'+esc(x.title)+' poster">':'')+
      '<div><span class="stream-kicker">'+(x.media_type==='movie'?'STREAMING MOVIE':'STREAMING TV SERIES')+'</span>'+
      '<h2>'+esc(x.title)+'</h2><p class="stream-meta">Original '+(x.media_type==='movie'?'film':'series')+
      ' year: '+esc(x.year||'unknown')+' · ★ '+Number(x.rating||0).toFixed(1)+'</p>'+
      '<p>'+esc(x.overview||'Description unavailable.')+'</p>'+
      '<div class="stream-detail-actions"><button class="stream-btn stream-accent" data-stream-save="'+esc(id)+'">'+
      (saved?.saved?'✓ Remove from Saved':'＋ Add to Saved')+'</button>'+
      '<button class="stream-btn" data-stream-like="'+esc(id)+'">'+(saved?.liked?'♥ Liked':'♡ Like')+'</button>'+
      '<a class="stream-btn" rel="noopener noreferrer" target="_blank" href="https://www.themoviedb.org/'+(x.media_type==='movie'?'movie':'tv')+'/'+x.id+'">Find where to watch ↗</a></div></div></div>'+
      '<h3>Reported streaming availability</h3>'+
      (sections||'<p>No listings for this country. Try All countries.</p>')+
      '<p class="stream-warning">Source: TMDb / JustWatch. Availability differs by country, account and time. A title’s original release or TV air date is not its streaming-platform arrival date. The TMDb link may offer external provider links.</p>';
    if(!$('stream-dialog').open)$('stream-dialog').showModal();
  }
  function showAlerts(){
    $('stream-alert-body').innerHTML=state.alerts.length?
      state.alerts.slice().reverse().map(a=>'<div class="stream-alert-row"><div><strong>'+esc(a.title)+'</strong>'+
        '<p>Newly listed in our source: '+esc(a.provider)+' · '+esc(COUNTRY[a.region]||a.region)+'</p>'+
        '<small>Detected '+esc(a.when.slice(0,10))+' — not a verified platform premiere</small></div>'+
        '<button class="stream-btn" data-stream-dismiss="'+esc(a.key)+'">Dismiss</button></div>').join(''):
      '<p>No new changes detected for saved streaming titles.</p>';
    if(!$('stream-alert-dialog').open)$('stream-alert-dialog').showModal();
  }
  async function refresh(){
    if(state.request)return;state.request=true;$('stream-last-updated').textContent='Checking current catalog…';
    try{
      const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),22000);
      let response;try{response=await fetch('./data/streaming.json?v='+Date.now(),{cache:'no-store',signal:ctrl.signal});}
      finally{clearTimeout(timer)}
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(data.schema_version!==1||data.status!=='ready'||!Array.isArray(data.movies)||!Array.isArray(data.shows))throw Error('invalid feed');
      const all=[...data.movies,...data.shows].map(normalize).filter(Boolean);
      if(!all.length)throw Error('empty streaming results');
      state.catalog=all;state.feed=data;state.ready=true;scanUpdates(data);render();
      if(state.alerts.length)announce('Streaming Saved has '+state.alerts.length+' new catalog changes.');
    }catch(e){console.warn('Streaming data unavailable:',e.message);render();announce('Streaming data unavailable; previous saved entries remain on this device.');}
    finally{state.request=false;}
  }
  function showStreaming(){
    document.body.classList.remove('tv-mode');
    $('tv-section').hidden=true;
    document.body.classList.add('stream-mode');
    $('stream-section').hidden=false;
    document.querySelectorAll('.nav .nav-item').forEach(el=>{el.classList.remove('active');el.setAttribute('aria-current','false')});
    $('stream-nav').classList.add('active');$('stream-nav').setAttribute('aria-current','page');
    if(location.hash!=='#streaming')history.replaceState(null,'',location.pathname+location.search+'#streaming');
    window.scrollTo({top:0,behavior:'instant'});
    render();
  }
  function hideStreaming(){
    document.body.classList.remove('stream-mode');$('stream-section').hidden=true;
    $('stream-nav').classList.remove('active');$('stream-nav').setAttribute('aria-current','false');
    if(location.hash==='#streaming')history.replaceState(null,'',location.pathname+location.search);
  }
  function install(){
    const nav=document.querySelector('.nav');
    nav.insertAdjacentHTML('beforeend','<button id="stream-nav" class="nav-item">Streaming</button>');
    document.querySelector('main').insertAdjacentHTML('beforeend',`
      <section id="stream-section" class="stream-section" hidden>
        <div class="stream-heading"><div><div class="stream-kicker">NETFLIX · PRIME VIDEO · DISNEY+ · HULU · STAN & MORE</div>
          <h1>Streaming.<br><em>One place to discover.</em></h1>
          <p>Movies and TV shows reported available on major streaming services. Availability is checked for your selected country.</p></div>
          <div class="stream-head-actions"><button id="stream-alerts" class="stream-btn">◉ Updates <span id="stream-alert-count" hidden></span></button><button id="stream-refresh" class="stream-btn">↻ Refresh</button></div>
        </div>
        <div class="stream-toolbar">
          <div class="stream-tabs"><button data-stream-mode="browse" class="is-active">Discover</button><button data-stream-mode="saved">Saved <span id="stream-saved-count">0</span></button></div>
          <div class="stream-tabs"><button data-stream-media="all" class="is-active">All</button><button data-stream-media="movie">Movies</button><button data-stream-media="tv">TV Series</button></div>
          <label>Country <select id="stream-region"><option value="ALL">All 4 countries</option><option value="ES">Spain</option><option value="US">United States</option><option value="GB">United Kingdom</option><option value="AU">Australia (Stan)</option></select></label>
          <label>Platform <select id="stream-provider"><option value="all">All platforms</option></select></label>
          <label class="stream-search-label">Search <input id="stream-search" type="search" placeholder="Search movies and series…" /></label>
        </div>
        <p class="stream-info"><b>Availability, not premieres:</b> We show where titles are listed for streaming. Movie release years and TV episode dates do not show when Netflix or another service first added a title. Subscription, free and ad-supported listings are included; rent/buy-only offers are excluded.</p>
        <div class="stream-resultline"><span><strong id="stream-count">0</strong> matching titles</span><span id="stream-last-updated">Loading…</span></div>
        <div id="stream-grid" class="stream-grid"></div><div id="stream-empty" class="stream-empty" hidden></div>
        <p class="stream-attribution">Streaming availability data provided by <a href="https://www.justwatch.com/" target="_blank" rel="noopener noreferrer"><b>JustWatch</b></a> via <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer">TMDb</a>. Neither service endorses this PWA. Provider lists can change without notice.</p>
      </section>`);
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="stream-dialog" class="stream-dialog" aria-label="Streaming title details"><button type="button" class="stream-x" data-stream-close="stream-dialog" aria-label="Close">×</button><div id="stream-dialog-body"></div></dialog>
      <dialog id="stream-alert-dialog" class="stream-dialog" aria-label="Streaming updates"><button class="stream-x" data-stream-close="stream-alert-dialog" aria-label="Close">×</button><h2>Streaming catalog changes</h2><div id="stream-alert-body"></div></dialog>
      <div id="stream-message" class="stream-message" role="status" aria-live="polite" hidden></div>`);
    $('stream-nav').addEventListener('click',showStreaming);
    document.querySelectorAll('.nav [data-view]').forEach(b=>b.addEventListener('click',hideStreaming));
    $('tv-nav').addEventListener('click',hideStreaming);
    document.querySelectorAll('[data-stream-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.streamMode;render()}));
    document.querySelectorAll('[data-stream-media]').forEach(b=>b.addEventListener('click',()=>{state.media=b.dataset.streamMedia;state.provider='all';render()}));
    $('stream-region').addEventListener('change',e=>{state.region=e.target.value;state.provider='all';render()});
    $('stream-provider').addEventListener('change',e=>{state.provider=e.target.value;render()});
    $('stream-search').addEventListener('input',e=>{state.q=e.target.value;render()});
    $('stream-refresh').addEventListener('click',refresh);
    $('stream-alerts').addEventListener('click',showAlerts);
    document.body.addEventListener('click',e=>{
      const close=e.target.closest('[data-stream-close]');if(close){$(close.dataset.streamClose).close();return;}
      const like=e.target.closest('[data-stream-like]');if(like){e.stopPropagation();const x=state.catalog.find(y=>ident(y)===like.dataset.streamLike)||state.saved[like.dataset.streamLike]?.snapshot;if(x)toggleSave(x,'liked');return;}
      const save=e.target.closest('[data-stream-save]');if(save){e.stopPropagation();const x=state.catalog.find(y=>ident(y)===save.dataset.streamSave)||state.saved[save.dataset.streamSave]?.snapshot;if(x)toggleSave(x,'saved');return;}
      const dismiss=e.target.closest('[data-stream-dismiss]');if(dismiss){state.alerts=state.alerts.filter(a=>a.key!==dismiss.dataset.streamDismiss);persist();render();showAlerts();return;}
      const card=e.target.closest('[data-stream-item]');if(card)openItem(card.dataset.streamItem);
    });
    $('stream-grid').addEventListener('keydown',e=>{if(e.target.matches('[data-stream-item]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openItem(e.target.dataset.streamItem)}});
    [$('stream-dialog'),$('stream-alert-dialog')].forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
    if(location.hash==='#streaming')showStreaming();
    render();refresh();
  }
  install();
})();
