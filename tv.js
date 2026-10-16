/* MAX Movie Radar: TV Shows + episode tracker. Local watch status stays on this device. */
(() => {
  'use strict';
  const KEY='max-movie-radar:v1:tv-tracker';
  const $=(id)=>document.getElementById(id);
  const today=()=>new Date().toISOString().slice(0,10);
  const day=(s)=>s?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')):'Unknown';
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const poster=(path,size='w500')=>typeof path==='string'&&/^\/[\w./-]+$/.test(path)?'https://image.tmdb.org/t/p/'+size+path:'';
  const load=()=>{try{const v=JSON.parse(localStorage.getItem(KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch{return {}}};
  const state={shows:[],ready:false,feed:null,view:'current',query:'',selected:null,season:0,records:load(),loading:false,visibleAlerts:[],alertedSession:false};
  const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(state.records))}catch{notice('TV progress could not be saved. Check browser storage.')}};
  const record=(id)=>state.records[id]||null;
  const aired=(show)=>show.episodes.filter(e=>e.air_date&&e.air_date<=today());
  const key=(e)=>e.key||('s'+String(e.season_number).padStart(2,'0')+'e'+String(e.episode_number).padStart(2,'0'));
  const known=(show)=>aired(show).map(key);
  const seenNow=(s)=>s.episodes.filter(e=>e.air_date&&e.air_date<=today()).sort((a,b)=>b.air_date.localeCompare(a.air_date))[0];
  const nextUp=(s)=>s.episodes.filter(e=>e.air_date&&e.air_date>today()).sort((a,b)=>a.air_date.localeCompare(b.air_date))[0];
  function notice(message){const box=$('tv-message');box.textContent=message;box.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>box.hidden=true,5000);}
  function norm(raw){
    if(!raw||!Number.isSafeInteger(raw.id)||!raw.name||!Array.isArray(raw.episodes))return null;
    const episodes=raw.episodes.filter(e=>Number.isInteger(e.season_number)&&e.season_number>0&&Number.isInteger(e.episode_number)&&e.episode_number>0&&/^\d{4}-\d{2}-\d{2}$/.test(e.air_date||'')).map(e=>({
      key:key(e),season_number:e.season_number,episode_number:e.episode_number,name:String(e.name||'Episode'),
      air_date:e.air_date,overview:String(e.overview||''),runtime:Number(e.runtime)||0
    }));
    return {id:raw.id,name:String(raw.name),original_name:String(raw.original_name||''),
      first_air_date:String(raw.first_air_date||''),status:String(raw.status||''),
      poster_path:raw.poster_path,backdrop_path:raw.backdrop_path,overview:String(raw.overview||''),
      genres:Array.isArray(raw.genres)?raw.genres.map(String):[],
      networks:Array.isArray(raw.networks)?raw.networks.map(String):[],
      popularity:Number(raw.popularity)||0,vote_average:Number(raw.vote_average)||0,
      original_language:String(raw.original_language||''),
      last_air_date:String(raw.last_air_date||''),next_air_date:String(raw.next_air_date||''),
      franchise:String(raw.franchise||''),episodes};
  }
  function follow(show){
    const previous=record(show.id);
    if(previous?.following){
      previous.following=false;
      persist();notice('Removed from Following. Watched episode history was preserved.');
    }else{
      state.records[show.id]={...previous,following:true,watched:previous?.watched||{},
        seen:Array.from(new Set([...(previous?.seen||[]),...known(show)])),
        alerts:previous?.alerts||[],relatedSeen:previous?.relatedSeen||relatedIds(show),
        title:show.name,poster_path:show.poster_path,first_air_date:show.first_air_date};
      persist();notice('Following '+show.name+'. Future new episodes will appear in Alerts.');
    }
    render();if($('tv-dialog').open)openShow(show.id);
  }
  function relatedIds(show){return !show.franchise?[]:state.shows.filter(s=>s.franchise===show.franchise).map(s=>s.id);}
  function scanAlerts(){
    let n=0,changed=false;
    const liveIds=new Set(state.shows.map(s=>s.id));
    for(const show of state.shows){
      const r=record(show.id);
      if(!r?.following)continue;
      if(!Array.isArray(r.seen)){r.seen=known(show);changed=true;}
      if(!r.watched||typeof r.watched!=='object'){r.watched={};changed=true;}
      if(!Array.isArray(r.alerts)){r.alerts=[];changed=true;}
      const old=new Set(r.seen);
      for(const ep of aired(show)){
        const k=key(ep);
        if(!old.has(k)&&!r.watched[k]&&!r.alerts.includes(k)){r.alerts.push(k);n++;changed=true;}
        if(!old.has(k)){r.seen.push(k);old.add(k);changed=true;}
      }
      if(show.franchise){
        if(!Array.isArray(r.relatedSeen)){r.relatedSeen=relatedIds(show);changed=true;}
        const related=new Set(r.relatedSeen);
        for(const item of state.shows.filter(s=>s.franchise===show.franchise)){
          if(!related.has(item.id)){
            const tag='related:'+item.id;
            if(!r.alerts.includes(tag)&&item.id!==show.id){r.alerts.push(tag);n++;changed=true;}
            r.relatedSeen.push(item.id);related.add(item.id);changed=true;
          }
        }
      }
      r.alerts=r.alerts.filter(x=>!x.startsWith('related:')||liveIds.has(Number(x.slice(8))));
    }
    if(changed)persist();
    buildAlerts();
    if(n>0)notice(n+' new TV update'+(n===1?'':'s')+' found. Open TV Alerts to review.');
  }
  function buildAlerts(){
    let items=[];
    for(const show of state.shows){
      const r=record(show.id);
      if(!r?.following)continue;
      for(const k of r.alerts||[]){
        if(k.startsWith('related:')){
          const target=state.shows.find(s=>s.id===Number(k.slice(8)));
          if(target)items.push({show,kind:'related',k,title:'Related series discovered',body:target.name,target:target.id,date:target.first_air_date||''});
        }else{
          const ep=show.episodes.find(x=>key(x)===k);
          if(ep&&!r.watched?.[k]&&ep.air_date<=today())items.push({show,kind:'episode',k,title:show.name,body:'S'+String(ep.season_number).padStart(2,'0')+'E'+String(ep.episode_number).padStart(2,'0')+' · '+ep.name,date:ep.air_date,target:show.id});
        }
      }
    }
    state.visibleAlerts=items.sort((a,b)=>b.date.localeCompare(a.date));
    const count=items.length;
    $('tv-alert-count').textContent=count;
    $('tv-alert-count').hidden=count===0;
    $('tv-notice-count').textContent=count;
    $('tv-notice-count').hidden=count===0;
    $('tv-bell').setAttribute('aria-label',count+' new TV alerts');
    const banner=$('tv-alert-banner');banner.hidden=count===0;
    $('tv-banner-text').textContent=count+' new episode or related-show update'+(count===1?'':'s')+' on shows you follow';
  }
  function filtered(){
    const q=state.query.trim().toLocaleLowerCase();
    const cutoff=new Date();cutoff.setUTCDate(cutoff.getUTCDate()-540);
    const dateCutoff=cutoff.toISOString().slice(0,10);
    return state.shows.filter(s=>{
      const tracked=Boolean(record(s.id)?.following);
      if(state.view==='following'&&!tracked)return false;
      if(state.view==='current'&&!tracked&&s.last_air_date<dateCutoff&&!s.next_air_date)return false;
      if(state.view==='universe'&&s.franchise!=='Big Bang universe')return false;
      if(q&&!((s.name+' '+s.original_name+' '+s.overview+' '+s.genres.join(' ')).toLocaleLowerCase().includes(q)))return false;
      return true;
    }).sort((a,b)=>{
      if(state.view==='universe')return a.first_air_date.localeCompare(b.first_air_date);
      const latest=s=>s.last_air_date||'';
      return latest(b).localeCompare(latest(a))||b.popularity-a.popularity;
    });
  }
  function card(show){
    const r=record(show.id);
    const latest=seenNow(show),upcoming=nextUp(show);
    const p=poster(show.poster_path);
    const newestAlerts=state.visibleAlerts.filter(a=>a.show.id===show.id).length;
    return '<article class="tv-card" data-show="'+show.id+'" tabindex="0" role="button" aria-label="Open '+esc(show.name)+'">'+
      '<div class="tv-poster">'+(p?'<img src="'+p+'" loading="lazy" alt="'+esc(show.name)+' poster" onerror="this.style.display=\'none\'">':'')+
      '<div class="tv-poster-empty">'+esc(show.name)+'</div>'+
      (newestAlerts?'<span class="tv-badge">NEW '+newestAlerts+'</span>':'')+
      '<button type="button" class="tv-follow '+(r?.following?'is-following':'')+'" data-follow="'+show.id+'" title="Toggle following" aria-label="'+(r?.following?'Unfollow ':'Follow ')+esc(show.name)+'">'+(r?.following?'♥':'♡')+'</button></div>'+
      '<div class="tv-card-title">'+esc(show.name)+'</div>'+
      '<div class="tv-card-meta">'+esc(show.first_air_date.slice(0,4))+' · '+esc(show.status||'TV series')+'</div>'+
      '<div class="tv-card-last">'+(latest?'Latest: S'+latest.season_number+'E'+latest.episode_number+' · '+day(latest.air_date):'No dated episodes')+'</div>'+
      (upcoming?'<div class="tv-card-next">Next scheduled · '+day(upcoming.air_date)+'</div>':'')+
      '</article>';
  }
  function render(){
    buildAlerts();
    const items=filtered();
    $('tv-count').textContent=items.length;
    $('tv-following-count').textContent=Object.values(state.records).filter(r=>r?.following).length;
    $('tv-shows-grid').innerHTML=items.map(card).join('');
    $('tv-empty').hidden=items.length>0;
    $('tv-empty').textContent=state.ready?'No matching TV shows in the current catalog. Try All shows or another search.':'TV catalog not yet published. The GitHub refresh workflow must complete.';
    $('tv-status').textContent=state.ready?'Updated '+day(state.feed.generated_at.slice(0,10))+' · '+state.shows.length+' series':'TV feed awaiting GitHub update';
    document.querySelectorAll('[data-tv-view]').forEach(b=>{b.classList.toggle('active',b.dataset.tvView===state.view);b.setAttribute('aria-pressed',String(b.dataset.tvView===state.view));});
  }
  function showDialog(show){
    const r=record(show.id);
    const selected=state.season||Math.max(0,...show.episodes.map(e=>e.season_number));
    state.season=selected;
    const options=[...new Set(show.episodes.map(e=>e.season_number))].sort((a,b)=>b-a);
    const episodes=show.episodes.filter(e=>e.season_number===state.season).sort((a,b)=>a.episode_number-b.episode_number);
    const p=poster(show.poster_path);
    const img=p?'<img class="tv-detail-poster" src="'+p+'" alt="'+esc(show.name)+' poster">':'';
    const connections=show.franchise?state.shows.filter(s=>s.franchise===show.franchise&&s.id!==show.id):[];
    $('tv-dialog-body').innerHTML='<div class="tv-detail-head">'+img+'<div class="tv-detail-info"><div class="tv-eyebrow">TV SERIES · ORIGINAL AIR DATES</div>'+
      '<h2>'+esc(show.name)+'</h2><p>'+esc(show.overview||'No description supplied.')+'</p>'+
      '<div class="tv-detail-meta">'+esc(show.first_air_date.slice(0,4))+' · '+esc(show.status||'')+' · '+esc(show.networks.join(', '))+'</div>'+
      '<div class="tv-detail-actions"><button class="tv-btn tv-primary" data-follow="'+show.id+'">'+(r?.following?'♥ Following':'♡ Follow series')+'</button>'+
      '<button class="tv-btn" id="tv-mark-aired">✓ Mark all aired episodes watched</button>'+
      '<a class="tv-btn" target="_blank" rel="noopener noreferrer" href="https://www.themoviedb.org/tv/'+show.id+'">View TMDb ↗</a></div></div></div>'+
      (connections.length?'<div class="tv-relatives"><b>Big Bang universe · Related series</b><div>'+connections.map(s=>'<button class="tv-link" data-related="'+s.id+'">'+esc(s.name)+'</button>').join('')+'</div></div>':'')+
      '<div class="tv-episode-header"><h3>Episode tracker</h3><label>Season <select id="tv-season">'+options.map(n=>'<option value="'+n+'" '+(n===selected?'selected':'')+'>Season '+n+'</option>').join('')+'</select></label></div>'+
      '<div class="tv-episode-list">'+(episodes.length?episodes.map(ep=>{
        const k=key(ep),released=ep.air_date<=today(),watched=Boolean(r?.watched?.[k]);
        return '<div class="tv-episode '+(watched?'watched':'')+'"><div class="tv-ep-code">S'+String(ep.season_number).padStart(2,'0')+'E'+String(ep.episode_number).padStart(2,'0')+'</div>'+
          '<div class="tv-ep-info"><strong>'+esc(ep.name)+'</strong><span>'+day(ep.air_date)+(released?' · Aired':' · Scheduled')+'</span>'+
          (ep.overview?'<p>'+esc(ep.overview)+'</p>':'')+'</div>'+
          '<button class="tv-watch '+(watched?'done':'')+'" data-episode="'+esc(k)+'" '+(!released?'disabled title="Not yet aired"':'')+' aria-pressed="'+watched+'">'+(watched?'✓ Watched':'Mark watched')+'</button></div>';
      }).join(''):'<p class="tv-muted">No dated episodes for this season.</p>')+'</div>'+
      '<p class="tv-source-note">Episode dates are based on TV listings and may vary by country or streaming service. This is not a confirmation of release on a local platform.</p>';
  }
  function openShow(id){
    const show=state.shows.find(s=>s.id===Number(id));if(!show)return;
    if(state.selected!==show.id)state.season=0;
    state.selected=show.id;
    showDialog(show);
    if(!$('tv-dialog').open)$('tv-dialog').showModal();
  }
  function markEpisode(k){
    const show=state.shows.find(s=>s.id===state.selected);if(!show)return;
    const episode=show.episodes.find(e=>key(e)===k);
    if(!episode||episode.air_date>today())return;
    let r=state.records[show.id];
    if(!r){r={following:false,watched:{},seen:[],alerts:[],title:show.name};state.records[show.id]=r;}
    if(!r.watched)r.watched={};
    if(r.watched[k])delete r.watched[k];else r.watched[k]=true;
    r.alerts=(r.alerts||[]).filter(s=>s!==k);
    persist();render();openShow(show.id);
  }
  function markAllAired(){
    const show=state.shows.find(s=>s.id===state.selected);if(!show)return;
    const r=state.records[show.id]||(state.records[show.id]={following:false,watched:{},seen:[],alerts:[],title:show.name});
    r.watched=r.watched||{};for(const ep of aired(show))r.watched[key(ep)]=true;
    r.alerts=(r.alerts||[]).filter(k=>k.startsWith('related:'));
    persist();render();openShow(show.id);notice('All currently aired episodes marked watched.');
  }
  function alertDialog(){
    buildAlerts();
    $('tv-alert-body').innerHTML=state.visibleAlerts.length?state.visibleAlerts.map(a=>
      '<div class="tv-alert-row"><div><strong>'+esc(a.title)+'</strong><p>'+esc(a.body)+'</p><small>'+day(a.date)+'</small></div>'+
      '<button class="tv-btn" data-alert-show="'+a.target+'">View</button>'+
      '<button class="tv-btn tv-dismiss" data-alert-dismiss="'+a.show.id+'" data-alert-key="'+esc(a.k)+'">Dismiss</button></div>').join(''):'<p class="tv-muted">No new episodes or related-show announcements. Follow a series to receive in-app updates.</p>';
    if(!$('tv-alert-dialog').open)$('tv-alert-dialog').showModal();
  }
  function dismiss(id,k){
    const r=record(id);if(!r)return;
    r.alerts=(r.alerts||[]).filter(a=>a!==k);persist();render();alertDialog();
  }
  async function refresh(){
    if(state.loading)return;state.loading=true;
    $('tv-status').textContent='Checking latest published TV schedule…';
    try{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      let response;try{response=await fetch('./data/tv.json?v='+Date.now(),{cache:'no-store',signal:controller.signal});}finally{clearTimeout(timer)}
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      if(data.status!=='ready'||data.schema_version!==1||!Array.isArray(data.shows))throw Error('TV schedule not ready');
      state.feed=data;state.shows=data.shows.map(norm).filter(Boolean);
      state.ready=true;scanAlerts();render();
    }catch(e){
      $('tv-status').textContent=state.ready?'Offline · showing last loaded TV data':'TV catalog not available';
      if(!state.ready)render();
      console.warn('TV feed fetch:',e.message);
    }finally{state.loading=false;}
  }
  function showTV(){
    $('tv-section').hidden=false;
    document.body.classList.add('tv-mode');
    document.querySelectorAll('.nav [data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-current','false')});
    $('tv-nav').classList.add('active');
    $('tv-nav').setAttribute('aria-current','page');
    if(location.hash!=='#tv')history.replaceState(null,'',location.pathname+location.search+'#tv');
    window.scrollTo({top:0,behavior:'instant'});
    render();
  }
  function showMovies(){
    document.body.classList.remove('tv-mode');$('tv-section').hidden=true;
    $('tv-nav').classList.remove('active');$('tv-nav').setAttribute('aria-current','false');
    if(location.hash==='#tv')history.replaceState(null,'',location.pathname+location.search);
  }
  function install(){
    document.querySelector('.nav').insertAdjacentHTML('beforeend','<button id="tv-nav" class="nav-item">TV Shows <span id="tv-alert-count" class="nav-count" hidden></span></button>');
    document.querySelector('main').insertAdjacentHTML('beforeend',`
      <section id="tv-section" class="tv-section" hidden>
        <div class="tv-intro"><div><div class="tv-eyebrow">YOUR SERIES · YOUR EPISODES</div>
        <h1>TV Shows.<br><em>Never miss an episode.</em></h1>
        <p>Discover current and returning series, follow your favourites and track what you've watched.</p></div>
        <div class="tv-head-controls"><button id="tv-bell" class="tv-btn tv-primary" aria-label="TV alerts">◉ TV Alerts <b id="tv-notice-count" hidden></b></button><button id="tv-refresh" class="tv-btn">↻ Refresh</button></div></div>
        <button id="tv-alert-banner" class="tv-alert-banner" hidden><strong>New TV updates</strong><span id="tv-banner-text"></span><span>See alerts →</span></button>
        <div class="tv-stats"><div><small>Shows in catalog</small><b id="tv-count">—</b></div><div><small>Following</small><b id="tv-following-count">0</b></div><div><small>Feed status</small><span id="tv-status">Connecting…</span></div></div>
        <div class="tv-toolbar"><div class="tv-tabs">
          <button class="tv-tab active" data-tv-view="current">Current & upcoming</button>
          <button class="tv-tab" data-tv-view="all">All shows</button>
          <button class="tv-tab" data-tv-view="following">Following</button>
          <button class="tv-tab" data-tv-view="universe">Big Bang universe</button></div>
          <input id="tv-search" type="search" placeholder="Search series, genres…" aria-label="Search TV shows" /></div>
        <div class="tv-hint">Original episode air dates, not DVD/Blu-ray releases. New episodes on followed shows appear in TV Alerts when you open or refresh the app.</div>
        <div id="tv-shows-grid" class="tv-grid"></div><div id="tv-empty" class="tv-empty" hidden></div>
      </section>`);
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="tv-dialog" class="tv-dialog" aria-label="TV show details"><button class="tv-close" data-tv-close="tv-dialog" aria-label="Close">×</button><div id="tv-dialog-body"></div></dialog>
      <dialog id="tv-alert-dialog" class="tv-dialog tv-alert-dialog" aria-label="TV alerts"><button class="tv-close" data-tv-close="tv-alert-dialog" aria-label="Close">×</button><div class="tv-alert-head"><h2>Your TV updates</h2><p>New episodes and related shows since you started following.</p></div><div id="tv-alert-body"></div></dialog>
      <div id="tv-message" class="tv-message" role="status" aria-live="polite" hidden></div>`);
    $('tv-nav').addEventListener('click',showTV);
    document.addEventListener('click',e=>{if(e.target.closest('.nav [data-view]'))showMovies();},true);
    document.querySelectorAll('[data-tv-view]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.tvView;render();}));
    $('tv-search').addEventListener('input',e=>{state.query=e.target.value;render();});
    $('tv-refresh').addEventListener('click',refresh);
    $('tv-bell').addEventListener('click',alertDialog);
    $('tv-alert-banner').addEventListener('click',alertDialog);
    document.body.addEventListener('click',e=>{
      const close=e.target.closest('[data-tv-close]');if(close){$(close.dataset.tvClose).close();return;}
      const followBtn=e.target.closest('[data-follow]');if(followBtn){e.stopPropagation();const show=state.shows.find(s=>s.id===Number(followBtn.dataset.follow));if(show)follow(show);return;}
      const mark=e.target.closest('[data-episode]');if(mark){markEpisode(mark.dataset.episode);return;}
      if(e.target.closest('#tv-mark-aired')){markAllAired();return;}
      const related=e.target.closest('[data-related]');if(related){openShow(related.dataset.related);return;}
      const dismissBtn=e.target.closest('[data-alert-dismiss]');if(dismissBtn){dismiss(dismissBtn.dataset.alertDismiss,dismissBtn.dataset.alertKey);return;}
      const viewAlert=e.target.closest('[data-alert-show]');if(viewAlert){$('tv-alert-dialog').close();openShow(viewAlert.dataset.alertShow);return;}
      const show=e.target.closest('[data-show]');if(show)openShow(show.dataset.show);
    });
    $('tv-shows-grid').addEventListener('keydown',e=>{if(e.target.matches('[data-show]')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openShow(e.target.dataset.show)}});
    $('tv-dialog').addEventListener('change',e=>{if(e.target.id==='tv-season'){state.season=Number(e.target.value);openShow(state.selected)}});
    [$('tv-dialog'),$('tv-alert-dialog')].forEach(d=>d.addEventListener('click',e=>{if(e.target===d)d.close()}));
    if(location.hash==='#tv')showTV();
    render();refresh();
  }
  install();
})();
