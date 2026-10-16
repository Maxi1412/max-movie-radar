/* MAX Movie Radar — personal Media Library shell and private NAS adapter.
   No NAS details, stream keys or inventory are shipped in the public repo.
   Saved/Tracked are never represented as verified "On NAS" media. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const KEYS={ui:'max-movie-radar:v1:media-library-ui',movies:'max-movie-radar:v1:library',tv:'max-movie-radar:v1:tv-tracker'};
  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const image=(p,sz='w500')=>typeof p==='string'&&/^\/[\w./-]+$/.test(p)?'https://image.tmdb.org/t/p/'+sz+p:'';
  const isMobile=()=>/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const now=()=>new Date().toISOString();
  const read=(key)=>{try{const d=JSON.parse(localStorage.getItem(key)||'{}');return d&&typeof d==='object'&&!Array.isArray(d)?d:{}}catch{return {}}};
  const old=read(KEYS.ui);
  const state={mode:'all',genre:'all',query:'',sort:'title',season:null,selected:null,playItem:null,resolvedStream:null,
    preference:typeof old.player==='string'?old.player:(isMobile()?'vlc':'auto'),
    progress:old.progress&&typeof old.progress==='object'?old.progress:{},
    nas:[],adapter:null,loadError:'',records:[],active:false,pendingUrl:'',lastSeen:'',
    tvFeed:[],imported:false};
  const itemId=m=>m.kind+':'+m.id;
  const notify=message=>{const el=$('lib-toast');el.textContent=message;el.hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>el.hidden=true,4500)};
  function save(){
    try{localStorage.setItem(KEYS.ui,JSON.stringify({player:state.preference,progress:state.progress}))}
    catch{notify('Could not save progress on this device. Check available browser storage.')}
  }
  const numberOr=(v,fallback)=>Number.isSafeInteger(Number(v))?Number(v):fallback;
  function normalizeMovie(input,verified=false) {
    if(!input||typeof input!=='object')return null;
    const id=String(input.tmdb_id||input.id||'').trim();
    const title=String(input.title||input.name||'').trim();
    if(!id||!title)return null;
    return {kind:'movie',id, title,year:String(input.year||''),poster_path:input.poster_path||null,
      backdrop_path:input.backdrop_path||null,overview:String(input.overview||''),
      genres:Array.isArray(input.genres)?input.genres.map(String):
             Array.isArray(input.genre_names)?input.genre_names.map(String):[],
      verified,mediaId:verified?String(input.media_id||input.mediaId||''):'',
      source:verified?'NAS index':'Saved in Movie Radar',episodes:[],
      added:String(input.added_at||input.added||''),status:''};
  }
  function normalizeShow(input,verified=false) {
    if(!input||typeof input!=='object')return null;
    const id=String(input.tmdb_id||input.id||'').trim();
    const title=String(input.title||input.name||'').trim();
    if(!id||!title)return null;
    const episodes=Array.isArray(input.episodes)?input.episodes.map(ep=>{
      const season=numberOr(ep.season??ep.season_number,-1);
      const episode=numberOr(ep.episode??ep.episode_number,-1);
      if(season<0||episode<1||season>100||episode>2000)return null;
      return {season,episode,id:String(ep.media_id||ep.mediaId||''),
        name:String(ep.name||'Episode '+episode),airDate:String(ep.air_date||ep.airDate||''),
        onNas:verified&&Boolean(ep.media_id||ep.mediaId),
        watched:Boolean(ep.watched)};
    }).filter(Boolean):[];
    return {kind:'tv',id,title,year:String(input.year||(input.first_air_date||'').slice(0,4)||''),
      poster_path:input.poster_path||null,backdrop_path:input.backdrop_path||null,
      overview:String(input.overview||''),genres:Array.isArray(input.genres)?input.genres.map(String):[],
      verified,mediaId:'',source:verified?'NAS index':'TV shows you track',episodes,
      added:String(input.added_at||''),status:String(input.status||'')};
  }
  function mergedRecords(){
    const result=new Map();
    const owned=read(KEYS.movies);
    for(const [key,v] of Object.entries(owned)){
      if(!v?.owned)continue;
      const m=normalizeMovie({...v,id:key},false);
      if(m)result.set(itemId(m),m);
    }
    const watched=read(KEYS.tv);
    for(const [key,v] of Object.entries(watched)){
      if(!v?.following&&!Object.values(v?.watched||{}).some(Boolean))continue;
      const source=state.tvFeed.find(s=>String(s.id)===key);
      const m=normalizeShow({...v,id:key,title:v.title||source?.name||('TV series #'+key),
        poster_path:v.poster_path||source?.poster_path,backdrop_path:source?.backdrop_path,
        overview:source?.overview,genres:source?.genres,status:source?.status,
        episodes:(source?.episodes||[]).map(e=>({
          season:e.season_number,episode:e.episode_number,name:e.name,
          air_date:e.air_date,watched:Boolean(v.watched?.[e.key])
        }))},false);
      if(m)result.set(itemId(m),m);
    }
    // Never overwrite a verified NAS record with a manually-saved record.
    for(const item of state.nas){
      const prior=result.get(itemId(item));
      if(prior){
        item.poster_path=item.poster_path||prior.poster_path;
        item.backdrop_path=item.backdrop_path||prior.backdrop_path;
        item.genres=item.genres.length?item.genres:prior.genres;
        item.overview=item.overview||prior.overview;
        if(item.kind==='tv'){
          const epMap=new Map(item.episodes.map(ep=>[ep.season+':'+ep.episode,{...ep}]));
          for(const ep of prior.episodes){
            const key=ep.season+':'+ep.episode,known=epMap.get(key);
            if(known){known.watched=Boolean(ep.watched)||Boolean(known.watched);known.airDate=known.airDate||ep.airDate;}
            else epMap.set(key,{...ep,onNas:false});
          }
          item.episodes=[...epMap.values()].sort((a,b)=>a.season-b.season||a.episode-b.episode);
        }
      }
      result.set(itemId(item),item);
    }
    state.records=[...result.values()].sort((a,b)=>a.title.localeCompare(b.title));
  }
  function poster(item,hero=false){
    const src=image(hero?item.backdrop_path||item.poster_path:item.poster_path,hero?'w1280':'w500');
    return src?'url("'+src+'")':'none';
  }
  function genres(){return [...new Set(state.records.flatMap(m=>m.genres||[]))].sort();}
  function filtered(){
    const q=state.query.trim().toLowerCase();
    return state.records.filter(m=>{
      if(state.mode==='movies'&&m.kind!=='movie')return false;
      if(state.mode==='shows'&&m.kind!=='tv')return false;
      if(state.mode==='nas'&&!m.verified)return false;
      if(state.mode==='continue'&&!(state.progress[itemId(m)]?.seconds>10))return false;
      if(state.genre!=='all'&&!m.genres.includes(state.genre))return false;
      if(q&&!(m.title+' '+m.year+' '+m.genres.join(' ')).toLowerCase().includes(q))return false;
      return true;
    }).sort((a,b)=>state.sort==='recent'?(b.added||'').localeCompare(a.added||'')||a.title.localeCompare(b.title):
      state.sort==='year'?b.year.localeCompare(a.year)||a.title.localeCompare(b.title):a.title.localeCompare(b.title));
  }
  function badges(m){
    const progress=state.progress[itemId(m)]||{};
    return (m.verified?'<span class="lib-status lib-on-nas">On NAS</span>':'<span class="lib-status">Saved / tracked</span>')+
      (progress.watched?'<span class="lib-status lib-watched">✓ Watched</span>':'');
  }
  function card(m){
    const cover=image(m.poster_path),progress=state.progress[itemId(m)]||{};
    const percent=progress.duration>0?Math.min(100,Math.round(100*progress.seconds/progress.duration)):0;
    return '<article class="lib-card" tabindex="0" role="button" data-lib-id="'+esc(itemId(m))+'" aria-label="View '+esc(m.title)+'">'+
       '<div class="lib-poster">'+(cover?'<img loading="lazy" decoding="async" src="'+cover+'" alt="'+esc(m.title)+' poster" onerror="this.hidden=true">':'')+
       '<span class="lib-fallback">'+esc(m.title)+'</span><span class="lib-kind">'+(m.kind==='tv'?'TV SERIES':'MOVIE')+'</span>'+
       (percent>0?'<span class="lib-progress"><i style="width:'+percent+'%"></i></span>':'')+'</div>'+
       '<strong>'+esc(m.title)+'</strong><div class="lib-meta">'+esc(m.year||'')+' · '+(m.kind==='tv'?'Series':'Film')+'</div>'+
       '<div class="lib-badges">'+badges(m)+'</div></article>';
  }
  function render(){
    mergedRecords();
    const all=state.records;
    const options=genres(),select=$('lib-genre');
    select.innerHTML='<option value="all">All genres</option>'+options.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('');
    if(!options.includes(state.genre))state.genre='all';select.value=state.genre;
    $('lib-count').textContent=all.length;
    $('lib-verified').textContent=all.filter(m=>m.verified).length;
    $('lib-movie-count').textContent=all.filter(m=>m.kind==='movie').length;
    $('lib-show-count').textContent=all.filter(m=>m.kind==='tv').length;
    $('lib-connection').textContent=state.adapter?'Private NAS connector available':
      state.imported?'Private index imported on this device':'NAS inventory not connected';
    const featured=all.find(m=>m.verified&&m.backdrop_path)||all.find(m=>m.backdrop_path)||all[0];
    const hero=$('lib-feature');
    if(featured){
      hero.style.backgroundImage=poster(featured,true);
      $('lib-feature-tag').textContent=featured.verified?'YOUR NAS MEDIA':'YOUR SAVED COLLECTION';
      $('lib-feature-title').textContent=featured.title;
      $('lib-feature-description').textContent=featured.overview||'Browse your collection and track what you have watched.';
      $('lib-feature-button').textContent='View details →';
      $('lib-feature-button').onclick=()=>openDetails(itemId(featured));
    }else{
      hero.style.backgroundImage='none';
      $('lib-feature-tag').textContent='PERSONAL MEDIA LIBRARY';
      $('lib-feature-title').textContent='Your films. Your series. One library.';
      $('lib-feature-description').textContent='Your existing saved collection will appear here. Codex will later connect the verified Synology inventory and secure playback.';
      $('lib-feature-button').textContent='Browse your saved titles ↓';
      $('lib-feature-button').onclick=()=>document.getElementById('lib-browser').scrollIntoView({behavior:'smooth'});
    }
    const rows=[
      {title:'Continue watching',items:all.filter(m=>{const x=state.progress[itemId(m)];return x?.seconds>10&&!x.watched}).slice(0,24)},
      {title:'Movies in your collection',items:all.filter(m=>m.kind==='movie').slice(0,30)},
      {title:'Your TV series',items:all.filter(m=>m.kind==='tv').slice(0,30)},
      {title:'Verified on NAS',items:all.filter(m=>m.verified).slice(0,30)}
    ].filter(r=>r.items.length);
    $('lib-rails').innerHTML=rows.map(r=>'<section class="lib-rail"><h3>'+r.title+'</h3><div class="lib-rail-track">'+r.items.map(card).join('')+'</div></section>').join('');
    const items=filtered();
    $('lib-grid').innerHTML=items.map(card).join('');
    $('lib-results-count').textContent=items.length;
    $('lib-empty').hidden=items.length>0;
    $('lib-empty').textContent=state.mode==='nas'
      ?'The Synology inventory has not been verified and connected. Saved titles are not automatically counted as NAS files.'
      :all.length?'No titles match these filters.':'No saved titles on this device yet. Add movies to My Collection or follow a TV show. Codex can link your real NAS library after inspecting its existing indexes.';
    document.querySelectorAll('[data-lib-mode]').forEach(b=>b.classList.toggle('active',b.dataset.libMode===state.mode));
  }
  const lookup=id=>state.records.find(m=>itemId(m)===id);
  const episodeId=(m,e)=>itemId(m)+':s'+String(e.season).padStart(2,'0')+'e'+String(e.episode).padStart(2,'0');
  function episodeRows(m,season){
    const relevant=m.episodes.filter(e=>e.season===season);
    if(!relevant.length)return '<p class="lib-muted">No episode list for this season yet. The verified NAS index and full-series data will be connected later.</p>';
    return relevant.sort((a,b)=>a.episode-b.episode).map(ep=>{
      const watched=Boolean(ep.watched||state.progress[episodeId(m,ep)]?.watched);
      return '<div class="lib-episode"><b>S'+String(ep.season).padStart(2,'0')+'E'+String(ep.episode).padStart(2,'0')+'</b>'+
        '<div><strong>'+esc(ep.name)+'</strong><small>'+(ep.onNas?'On NAS':'Not verified on NAS')+(ep.airDate?' · '+esc(ep.airDate):'')+
        (watched?' · ✓ Watched':'')+'</small></div>'+
        (ep.onNas?'<button class="lib-action" data-lib-episode="'+esc(itemId(m))+'" data-lib-s="'+ep.season+'" data-lib-e="'+ep.episode+'">▶ Play</button>':'')+
        '<button class="lib-action" data-lib-watch-episode="'+esc(itemId(m))+'" data-lib-s="'+ep.season+'" data-lib-e="'+ep.episode+'">'+
        (watched?'✓ Watched':'Mark watched')+'</button></div>';
    }).join('');
  }
  function openDetails(id){
    mergedRecords();const m=lookup(id);if(!m)return;
    state.selected=id;state.season=null;
    const options=[...new Set(m.episodes.map(ep=>ep.season))].sort((a,b)=>b-a);
    if(m.kind==='tv'&&options.length)state.season=options[0];
    const img=image(m.poster_path);
    const progress=state.progress[id]||{};
    $('lib-detail-body').innerHTML='<div class="lib-detail-head">'+
      (img?'<img src="'+img+'" alt="'+esc(m.title)+' poster">':'')+
      '<div><div class="lib-eyebrow">'+(m.kind==='movie'?'MOVIE':'TV SERIES')+' · '+(m.verified?'VERIFIED IN NAS INDEX':'SAVED / TRACKED')+'</div>'+
      '<h2>'+esc(m.title)+'</h2><p class="lib-detail-meta">'+esc(m.year)+' · '+esc(m.genres.join(' · '))+'</p>'+
      '<p class="lib-description">'+esc(m.overview||'Information will appear when the NAS index and matching metadata are connected.')+'</p>'+
      '<div class="lib-detail-buttons"><button class="lib-button lib-primary" id="lib-play-selected">'+(m.kind==='tv'?'Browse episodes ↓':m.verified?'▶ Choose player':'▶ Playback not connected')+'</button>'+
      '<button class="lib-button" id="lib-mark-watched">'+(progress.watched?'✓ Watched — undo':'✓ Mark movie watched')+'</button>'+
      '</div></div></div>'+
      (m.kind==='tv'?'<div class="lib-seasons"><div class="lib-seasons-head"><h3>Seasons & episodes</h3>'+
        (options.length?'<label>Season <select id="lib-season">'+options.map(n=>'<option value="'+n+'">'+n+'</option>').join('')+'</select></label>':'')+'</div>'+
        '<div id="lib-episode-list">'+(options.length?episodeRows(m,options[0]):'<p class="lib-muted">Season details appear when the NAS inventory is connected. Existing tracked episodes will be included where available.</p>')+'</div></div>':'')+
      '<p class="lib-honesty">“Saved / tracked” does not confirm a file exists on your NAS. Playback is enabled only after Codex connects and verifies a secure private media source.</p>';
    if(m.kind==='tv')$('lib-mark-watched').textContent='✓ Mark series finished';
    $('lib-play-selected').addEventListener('click',()=>{
      if(m.kind==='tv')$('lib-episode-list')?.scrollIntoView({behavior:'smooth'});
      else choosePlayer(id,null);
    });
    $('lib-mark-watched').addEventListener('click',()=>{const v=state.progress[id]||{};v.watched=!v.watched;state.progress[id]=v;save();openDetails(id);notify(v.watched?'Marked watched':'Marked unwatched')});
    const sel=$('lib-season');
    if(sel)sel.addEventListener('change',()=>{$('lib-episode-list').innerHTML=episodeRows(m,Number(sel.value))});
    if(!$('lib-detail').open)$('lib-detail').showModal();
  }
  function toggleEpisode(id,season,number){
    const m=lookup(id),ep=m?.episodes.find(e=>e.season===season&&e.episode===number);
    if(!ep)return;
    const key=episodeId(m,ep);
    const prev=Boolean(ep.watched||state.progress[key]?.watched);
    const next=!prev;
    ep.watched=next;
    state.progress[key]={...(state.progress[key]||{}),watched:next,last:now()};
    if(m.kind==='tv'){
      const raw=read(KEYS.tv),rec=raw[m.id]||{following:false,watched:{},seen:[],alerts:[],title:m.title};
      rec.watched=rec.watched||{};
      const epKey='s'+String(season).padStart(2,'0')+'e'+String(number).padStart(2,'0');
      if(next)rec.watched[epKey]=true;else delete rec.watched[epKey];
      raw[m.id]=rec;
      try{localStorage.setItem(KEYS.tv,JSON.stringify(raw))}catch{notify('Unable to update the TV tracker')}
    }
    for(const match of state.nas.filter(v=>itemId(v)===id))
      for(const candidate of match.episodes||[])
        if(candidate.season===season&&candidate.episode===number)candidate.watched=next;
    save();render();openDetails(id);
    const select=$('lib-season');if(select){select.value=String(season);$('lib-episode-list').innerHTML=episodeRows(lookup(id),season)}
  }
  async function choosePlayer(id,ep){
    const m=lookup(id);if(!m)return;
    if(!m.verified||!state.adapter||typeof state.adapter.resolvePlayback!=='function'){
      notify('Playback needs the private NAS connector. Codex will link this after inspecting your existing indexes.');
      return;
    }
    state.playItem={id,ep};state.resolvedStream=null;
    $('lib-player-name').textContent=m.title+(ep?' · S'+ep.season+'E'+ep.episode:'');
    $('lib-player-option').value=state.preference;
    $('lib-player-hint').textContent='Requesting a private playback link from the NAS…';
    $('lib-launch').disabled=true;
    if(!$('lib-player-choice').open)$('lib-player-choice').showModal();
    try{
      // Prepare the ephemeral URL BEFORE the final user click so Chrome's
      // Android-intent / share gesture is not lost across an awaited fetch.
      const result=await state.adapter.resolvePlayback({
        kind:m.kind,tmdbId:m.id,mediaId:ep?.id||m.mediaId,
        season:ep?.season,episode:ep?.episode
      });
      const stream=safeStream(result);
      if(!stream)throw Error('No valid playback URL');
      if(state.playItem?.id!==id||state.playItem.ep!==ep)return;
      state.resolvedStream=stream;
      $('lib-launch').disabled=false;
      $('lib-player-hint').textContent=isMobile()
        ?'Android: VLC is selected by default. You may instead choose your installed apps or browser playback.'
        :'Browser playback is automatic on desktop; change player if needed.';
    }catch(e){
      console.warn('Private playback resolver:',e.message);
      $('lib-player-hint').textContent='No playable link available. Check the private NAS connector.';
      notify('A secure stream could not be prepared; no playback has started.');
    }
  }
  function safeStream(data){
    if(!data||typeof data.url!=='string')return null;
    try{
      const u=new URL(data.url);
      if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
      return {url:u.href,mime:typeof data.mime==='string'?data.mime:'video/mp4'};
    }catch{return null}
  }
  function launchPlayer(){
    const payload=state.playItem,stream=state.resolvedStream;
    if(!payload||!stream)return;
    const mode=$('lib-player-option').value;
    if($('lib-remember-player').checked){state.preference=mode;save()}
    const m=lookup(payload.id);if(!m)return;
    const ep=payload.ep,actual=mode==='auto'?(isMobile()?'system':'browser'):mode;
    if(actual==='browser'){
      if(new URL(stream.url).protocol!=='https:'&&location.protocol==='https:'){
        notify('Browser playback needs an HTTPS stream endpoint. Choose VLC/system or enable HTTPS on the private media gateway.');return;
      }
      $('lib-player-choice').close();
      const player=$('lib-video');player.src=stream.url;player.load();
      state.pendingUrl=ep?episodeId(m,ep):payload.id;
      $('lib-video-title').textContent=m.title+(ep?' · S'+ep.season+'E'+ep.episode:'');
      if(!$('lib-video-dialog').open)$('lib-video-dialog').showModal();
      player.play().catch(()=>notify('Tap Play in the video controls. Some file codecs require an external player.'));
    }else if(actual==='vlc'&&/Android/i.test(navigator.userAgent)){
      $('lib-player-choice').close();
      const u=new URL(stream.url);
      const intent='intent://'+u.host+u.pathname+u.search+
        '#Intent;scheme='+u.protocol.replace(':','')+
        ';action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;end';
      // A user-triggered intent may launch VLC if installed; its success is
      // NOT observable by the PWA and must be verified on the actual device.
      window.location.href=intent;
    }else if(actual==='system'&&navigator.share){
      $('lib-player-choice').close();
      navigator.share({title:m.title,url:stream.url})
        .catch(e=>{if(e.name!=='AbortError')notify('Your device could not open the app chooser. Try Browser or VLC.')});
    }else{
      $('lib-player-choice').close();
      window.open(stream.url,'_blank','noopener');
    }
  }
  function syncProgress(){
    const video=$('lib-video'),id=state.pendingUrl;
    if(!id||!Number.isFinite(video.currentTime))return;
    const data=state.progress[id]||{};
    data.seconds=Math.round(video.currentTime);
    if(Number.isFinite(video.duration))data.duration=Math.round(video.duration);
    data.last=now();state.progress[id]=data;save();
  }
  function closeLibrary(){
    document.body.classList.remove('library-mode');
    $('lib-section').hidden=true;state.active=false;
    $('lib-nav').classList.remove('active');$('lib-nav').setAttribute('aria-current','false');
    if(location.hash==='#library')history.replaceState(null,'',location.pathname+location.search);
  }
  function showLibrary(){
    if($('tv-section'))$('tv-section').hidden=true;
    if($('stream-section'))$('stream-section').hidden=true;
    document.body.classList.remove('tv-mode','stream-mode');
    document.body.classList.add('library-mode');
    $('lib-section').hidden=false;
    state.active=true;
    document.querySelectorAll('.nav .nav-item').forEach(el=>{el.classList.toggle('active',el.id==='lib-nav');el.setAttribute('aria-current',el.id==='lib-nav'?'page':'false')});
    if(location.hash!=='#library')history.replaceState(null,'',location.pathname+location.search+'#library');
    window.scrollTo({top:0,behavior:'instant'});
    render();
  }
  async function refreshTV(){
    try{const r=await fetch('./data/tv.json',{cache:'no-store'});if(r.ok){const d=await r.json();state.tvFeed=Array.isArray(d.shows)?d.shows:[];if(state.active)render()}}
    catch(e){console.info('TV metadata unavailable to library:',e.message)}
  }
  function importSchema(payload){
    if(!payload||payload.schema_version!==1||!Array.isArray(payload.movies)||!Array.isArray(payload.shows))
      throw Error('Expected a private media index with schema_version 1, movies[] and shows[]');
    if(payload.movies.length+payload.shows.length>20000)throw Error('Index exceeds the 20,000 title safety limit');
    const films=payload.movies.map(v=>normalizeMovie(v,true)).filter(Boolean);
    const shows=payload.shows.map(v=>normalizeShow(v,true)).filter(Boolean);
    // Mark as verified ONLY for entries with an actual private media ID / episode IDs.
    const normalized=[...films,...shows].filter(v=>{
      v.verified=Boolean(v.kind==='movie'?v.mediaId:v.episodes.some(ep=>ep.onNas));
      v.source=v.verified?'NAS index':'Unverified imported record';return true;
    });
    return normalized;
  }
  function updateInventory(payload){
    state.nas=importSchema(payload);
    state.imported=true;
    if(state.active)render();
    notify('Loaded '+state.nas.length+' local index titles. This import stays on this device and is not uploaded.');
  }
  function help(){
    $('lib-help').showModal();
  }
  function install(){
    const nav=document.querySelector('.nav'),main=document.querySelector('main');
    if(!nav||!main)return;
    nav.insertAdjacentHTML('beforeend','<button type="button" id="lib-nav" class="nav-item">Media Library</button>');
    main.insertAdjacentHTML('beforeend',`
      <section id="lib-section" class="lib-section" hidden>
        <div class="lib-intro"><div><div class="lib-eyebrow">YOUR PERSONAL MOVIES & SERIES</div><h1>Media Library<span>.</span></h1>
        <p>A cinema-style view of what you've saved now, with a private Synology library and playback connection planned next.</p></div>
        <div class="lib-intro-actions"><button class="lib-button" id="lib-connect-help">NAS connection <span class="lib-light">pending</span></button></div></div>
        <div class="lib-feature" id="lib-feature"><div class="lib-feature-shade"></div><div class="lib-feature-copy">
          <span id="lib-feature-tag" class="lib-eyebrow">PERSONAL MEDIA LIBRARY</span>
          <h2 id="lib-feature-title">Your films. Your series. One library.</h2><p id="lib-feature-description"></p>
          <button class="lib-button lib-primary" id="lib-feature-button">Explore collection ↓</button></div></div>
        <div class="lib-stat-strip"><div><strong id="lib-count">0</strong><small>Collection titles</small></div>
          <div><strong id="lib-movie-count">0</strong><small>Movies</small></div>
          <div><strong id="lib-show-count">0</strong><small>TV shows</small></div>
          <div><strong id="lib-verified">0</strong><small>Verified on NAS</small></div></div>
        <div class="lib-connection"><span class="lib-dot"></span><span id="lib-connection">NAS inventory not connected</span>
          <button id="lib-import-help">About private sync</button></div>
        <div id="lib-rails"></div>
        <section id="lib-browser" class="lib-browser"><div class="lib-headline"><div><span class="lib-eyebrow">BROWSE YOUR COLLECTION</span><h2>All your titles <small id="lib-results-count">0</small></h2></div></div>
        <div class="lib-toolbar"><div class="lib-filters">
          <button class="active" data-lib-mode="all">Everything</button><button data-lib-mode="movies">Movies</button>
          <button data-lib-mode="shows">TV Shows</button><button data-lib-mode="nas">On NAS</button>
          <button data-lib-mode="continue">Continue Watching</button></div>
          <label>Genre <select id="lib-genre"><option value="all">All genres</option></select></label>
          <label>Sort <select id="lib-sort"><option value="title">Title A–Z</option><option value="recent">Recently added</option><option value="year">Movie/series year</option></select></label>
          <label>Search <input id="lib-search" type="search" placeholder="Search your library…" /></label></div>
        <div id="lib-grid" class="lib-grid"></div><p id="lib-empty" class="lib-empty" hidden></p></section>
        <div class="lib-bottom-note">Only titles confirmed by the private NAS index get the “On NAS” badge.
        Your existing Movie Radar collection and TV tracking are shown separately until the NAS connection is built.</div>
      </section>`);
    document.body.insertAdjacentHTML('beforeend',`
      <dialog id="lib-detail" class="lib-dialog" aria-label="Media Library details"><button class="lib-close" data-lib-close="lib-detail">×</button><div id="lib-detail-body"></div></dialog>
      <dialog id="lib-player-choice" class="lib-dialog lib-player-choice" aria-label="Choose media player"><button class="lib-close" data-lib-close="lib-player-choice">×</button>
        <h2>Choose how to play</h2><p id="lib-player-name"></p><label>Player <select id="lib-player-option">
          <option value="auto">Auto — browser on desktop, system on phone</option>
          <option value="vlc">VLC — Android</option><option value="browser">Play inside Movie Radar</option>
          <option value="system">Choose installed app / system</option></select></label>
        <label class="lib-check"><input type="checkbox" id="lib-remember-player" /> Remember my choice on this device</label>
        <p class="lib-muted" id="lib-player-hint"></p><button class="lib-button lib-primary" id="lib-launch">▶ Play</button></dialog>
      <dialog id="lib-video-dialog" class="lib-dialog lib-video-dialog" aria-label="Media playback"><button class="lib-close" data-lib-close="lib-video-dialog">×</button>
        <h2 id="lib-video-title">Now playing</h2><video id="lib-video" controls playsinline preload="metadata"></video>
        <p class="lib-muted">Browser progress is stored on this device. VLC playback progress cannot automatically be read by this web page.</p></dialog>
      <dialog id="lib-help" class="lib-dialog lib-player-choice" aria-label="Private NAS connection"><button class="lib-close" data-lib-close="lib-help">×</button>
        <h2>Private NAS connection — next phase</h2><p>Codex will first inspect and reuse the existing Synology movie and TV indexes. A secure media service will then supply verified collection entries and playable streams.</p>
        <p><b>VLC on Android is your preferred player.</b> You can change players for each item. The current page never exposes NAS logins or private file paths in public GitHub.</p>
        <p>You may also load a local, sanitized <code>schema_version: 1</code> media-index JSON for preview. This file is read only on your device, never uploaded to GitHub. Raw NAS indexes may require conversion by Codex first.</p>
        <button class="lib-button" id="lib-import">Import local index JSON</button><input id="lib-file" type="file" accept=".json,application/json" hidden /></dialog>
      <div id="lib-toast" class="lib-toast" hidden aria-live="polite"></div>`);
    $('lib-nav').addEventListener('click',showLibrary);
    document.addEventListener('click',e=>{if(state.active&&e.target.closest('.nav .nav-item')&&e.target.id!=='lib-nav')closeLibrary();},true);
    document.querySelectorAll('[data-lib-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.libMode;render()}));
    $('lib-genre').addEventListener('change',e=>{state.genre=e.target.value;render()});
    $('lib-sort').addEventListener('change',e=>{state.sort=e.target.value;render()});
    $('lib-search').addEventListener('input',e=>{state.query=e.target.value;render()});
    $('lib-connect-help').addEventListener('click',help);$('lib-import-help').addEventListener('click',help);
    $('lib-import').addEventListener('click',()=>$('lib-file').click());
    $('lib-file').addEventListener('change',async e=>{
      const file=e.target.files?.[0];if(!file)return;
      try{if(file.size>12_000_000)throw Error('File exceeds 12 MB; use a private connector for large indexes');
        updateInventory(JSON.parse(await file.text()));
      }catch(err){notify('Index not accepted: '+err.message)}finally{e.target.value=''}
    });
    document.body.addEventListener('click',e=>{
      const close=e.target.closest('[data-lib-close]');if(close){const dlg=$(close.dataset.libClose);dlg.close();return}
      const ep=e.target.closest('[data-lib-episode]');
      if(ep){const m=lookup(ep.dataset.libEpisode),found=m?.episodes.find(x=>x.season===Number(ep.dataset.libS)&&x.episode===Number(ep.dataset.libE));
        if(found){if(found.onNas)choosePlayer(itemId(m),found);else notify('This episode has not been verified on your NAS.')}return}
      const toggle=e.target.closest('[data-lib-watch-episode]');
      if(toggle){toggleEpisode(toggle.dataset.libWatchEpisode,Number(toggle.dataset.libS),Number(toggle.dataset.libE));return}
      const card=e.target.closest('[data-lib-id]');if(card)openDetails(card.dataset.libId);
    });
    $('lib-grid').addEventListener('keydown',e=>{const card=e.target.closest('[data-lib-id]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetails(card.dataset.libId)}});
    $('lib-rails').addEventListener('keydown',e=>{const card=e.target.closest('[data-lib-id]');if(card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDetails(card.dataset.libId)}});
    $('lib-launch').addEventListener('click',launchPlayer);
    $('lib-video').addEventListener('timeupdate',()=>{if(Math.round($('lib-video').currentTime)%8===0)syncProgress()});
    $('lib-video').addEventListener('pause',syncProgress);
    $('lib-video').addEventListener('ended',()=>{syncProgress();const id=state.pendingUrl;state.progress[id]={...(state.progress[id]||{}),watched:true};save();render()});
    $('lib-video-dialog').addEventListener('close',()=>{syncProgress();$('lib-video').pause();$('lib-video').removeAttribute('src');$('lib-video').load();state.pendingUrl=''});
    for(const dlg of document.querySelectorAll('#lib-detail,#lib-player-choice,#lib-video-dialog,#lib-help')){
      dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
    }
    if(location.hash==='#library')showLibrary();
    refreshTV().then(()=>{if(state.active)render()});
  }
  // Called by a future private companion adapter on the user's device.
  // adapter.loadInventory() -> private sanitized schema_version:1 JSON.
  // adapter.resolvePlayback({kind,tmdbId,mediaId,season?,episode?}) -> {url,mime}
  window.MaxMovieRadarLibrary=Object.freeze({
    async connect(adapter){
      if(!adapter||typeof adapter.loadInventory!=='function'||typeof adapter.resolvePlayback!=='function')
        throw Error('Expected loadInventory and resolvePlayback functions');
      const payload=await adapter.loadInventory();
      const validated=importSchema(payload);
      state.adapter=adapter;state.nas=validated;state.imported=true;
      if(state.active)render();return {count:validated.length,verified:validated.filter(m=>m.verified).length};
    },
    refresh(){if(state.active)render()},
    loadPreview(payload){updateInventory(payload)},
  });
  install();
})();