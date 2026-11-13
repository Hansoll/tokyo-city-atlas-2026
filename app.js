(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('region-dialog');
  const aboutDialog = $('about-dialog');
  const photoDialog = $('photo-dialog');
  const state = { areas: [], current: null, page: 0, photo: 0, opener: null, lastActivities: new Map(), lastPhotos: new Map(), view: 'map', selected: null, selectedPage: undefined, selectedActivity: null, selectedPlace: null, selectedPhoto: 0, category: 'all', query: '', savedOnly: false, saved: new Set(), storageAvailable: true };
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = value => /^https?:\/\//.test(value || '') ? value : '#';
  const external = (url, label, classes) => '<a class="' + (classes || '') + '" href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>';
  const photoLinks = (photo, label) => external(photo.source_page, label) +
    (photo.license_url ? ' · ' + external(photo.license_url, photo.license || '이용 조건') : '') +
    (photo.modifications ? ' <span>· ' + esc(photo.modifications) + '</span>' : '');
  const photosFor = activity => Array.isArray(activity.images) && activity.images.length ? activity.images : [activity.image].filter(Boolean);
  const currentActivity = () => state.current && state.current.activities[state.page];
  const syncScrollLock = () => { document.body.style.overflow = document.querySelector('dialog[open]') ? 'hidden' : ''; };
  let mapApi = null;
  let sheetApi = null;

  const storageKey = 'tokyo-atlas-saved-areas-v1';
  const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const featured = [
    {id:'ueno',activity:'ueno_ameyoko',src:'assets/ueno-1.webp',tag:'시장 골목 · 간식 · 공원',name:'우에노',note:'걷다가 만나는 즐거움'},
    {id:'akihabara',activity:'aki_animate',src:'assets/gallery/aki_animate-1.webp',tag:'애니메이션 · 굿즈 · 메이드 카페',name:'아키하바라',note:'좋아하는 것에 푹 빠지는 시간'},
    {id:'shibuya',activity:'shibuya_crossing',src:'assets/shibuya-1.webp',tag:'교차로 · 전망 · PARCO',name:'시부야',note:'도시의 에너지를 가까이'},
    {id:'asakusa',activity:'asakusa_temple',src:'assets/gallery/asakusa_temple-2.webp',tag:'사찰 · 간식 · 강변 산책',name:'아사쿠사',note:'오래된 도쿄를 천천히'},
    {id:'tokyo_marunouchi',activity:'tokyo_marunouchi_station',src:'assets/gallery/tokyo_marunouchi_station-2.webp',position:'80% 50%',tag:'붉은 벽돌 · 건축 · 야경',name:'도쿄역·마루노우치',note:'도시가 반짝이는 저녁'}
  ];
  const categoryPatterns = {
    food:/시장|간식|음식|먹거리|식사|라멘|카페|커피|디저트|술집|이자카야/,
    shopping:/쇼핑|패션|굿즈|애니|전자|피규어|가챠|캐릭터|상점가|백화점|빈티지|취미|소품|캡슐토이/,
    culture:/미술|박물관|전시|체험|전망|야경|수족관|동물|플라네|놀이|공연|극장|아트|예술|역사/,
    relax:/산책|공원|정원|온천|휴식|신사|사찰|강변|숲길|피크닉|풍경|광장/
  };
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[\s·.,/()_-]+/g,'');
  const coverFor = area => featured.find(item=>item.id===area.id) || {src:photosFor(area.activities[0])[0].src};
  function saveButton(area) {
    const saved=state.saved.has(area.id);
    return '<button type="button" class="save-button'+(saved?' is-saved':'')+'" data-save-area="'+esc(area.id)+'" aria-pressed="'+saved+'" aria-label="'+esc(area.name)+(saved?' 저장 해제':' 저장')+'">'+icon('heart')+'</button>';
  }
  function areaCard(area,initialPage) {
    const cover=coverFor(area),active=state.selected===area.id;
    return '<article class="area-card"><button type="button" class="area-tile'+(active?' active':'')+'" data-area="'+esc(area.id)+'"'+(initialPage==null?'':' data-initial-page="'+initialPage+'"')+' aria-label="'+esc(area.name)+' 위치와 즐길 거리 '+area.activities.length+'개 미리보기">'+
      '<img class="tile-image" src="'+esc(cover.src)+'" alt="" loading="lazy" width="600" height="500"'+(cover.position?' style="object-position:'+cover.position+'"':'')+'><span class="tile-copy"><span class="tile-name">'+esc(area.name)+'</span><span class="tile-kicker">'+esc(area.kicker)+'</span><span class="tile-total">'+icon('pin')+'즐길 거리 '+area.activities.length+'개</span></span></button>'+saveButton(area)+'</article>';
  }
  function matchingPages(area) {
    const terms=state.query.trim().split(/\s+/).map(normalize).filter(Boolean);
    const areaText=area.name+' '+area.mapName+' '+area.kicker;
    return area.activities.reduce((matches,activity,index)=>{
      const categoryText=activity.eyebrow+' '+activity.title;
      const searchable=normalize(areaText+' '+categoryText+' '+activity.navTitle+' '+activity.description+' '+activity.highlights.join(' ')+' '+activity.mapQuery);
      if((state.category==='all'||categoryPatterns[state.category].test(categoryText))&&terms.every(term=>searchable.includes(term)))matches.push(index);
      return matches;
    },[]);
  }
  function directoryMatches() {
    return state.areas.filter(area=>!state.savedOnly||state.saved.has(area.id)).map(area=>({area,pages:matchingPages(area)})).filter(item=>item.pages.length);
  }
  function renderPeek() {
    const matches=directoryMatches();
    matches.sort((a,b)=>{
      const rank=id=>{const i=featured.findIndex(f=>f.id===id);return i<0?20:i;};
      return rank(a.area.id)-rank(b.area.id);
    });
    $('peek-area-list').innerHTML=matches.map(({area,pages})=>{
      const cover=coverFor(area);
      return '<button class="peek-card" type="button" data-area="'+esc(area.id)+'"'+(state.query||state.category!=='all'?' data-initial-page="'+pages[0]+'"':'')+' aria-label="'+esc(area.name)+' 위치와 즐길 거리 '+area.activities.length+'개 미리보기"><img src="'+esc(cover.src)+'" alt="" width="92" height="92" loading="lazy"'+(cover.position?' style="object-position:'+cover.position+'"':'')+'><span><span class="peek-name">'+esc(area.name)+'</span><span class="peek-kicker">'+esc(area.kicker)+'</span><span class="peek-total">즐길 거리 '+area.activities.length+'개</span></span></button>';
    }).join('');
    if(!matches.length)$('peek-area-list').innerHTML='<p class="peek-empty">'+(state.savedOnly?'저장한 동네가 없어요. 하트를 눌러 담아보세요.':'일치하는 동네가 없어요. 목록을 펼쳐 검색어를 바꿔보세요.')+'</p>';
  }
  function renderDirectory() {
    const filtering=!!state.query.trim()||state.category!=='all';
    const matches=directoryMatches();
    $('area-list').innerHTML=matches.map(({area,pages})=>areaCard(area,filtering?pages[0]:null)).join('');
    $('area-count').textContent=matches.length;
    $('empty-results').hidden=matches.length>0;
    $('empty-title').textContent=state.savedOnly&&!state.saved.size?'아직 저장한 동네가 없어요':'일치하는 동네가 없어요';
    $('empty-message').textContent=state.savedOnly&&!state.saved.size?'마음에 드는 동네의 하트를 눌러 모아보세요.':'다른 검색어를 입력하거나 취향 선택을 바꿔보세요.';
    $('search-summary').hidden=!filtering;
    $('search-summary').textContent=(state.query.trim()?'“'+state.query.trim()+'” · ':'')+matches.length+'개 동네에서 찾았어요.';
    $('clear-search').hidden=!state.query;
    $('all-filter').setAttribute('aria-pressed',String(!state.savedOnly));
    $('saved-filter').setAttribute('aria-pressed',String(state.savedOnly));
    document.querySelectorAll('[data-category]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===state.category)));
    renderPeek();syncSaveButtons();
    if(sheetApi)sheetApi.refresh();
  }
  function parseSaved(raw) {
    try {const ids=JSON.parse(raw||'[]');return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&state.areas.some(area=>area.id===id)):[]);}
    catch {return new Set();}
  }
  function readSaved() {
    try {state.saved=parseSaved(localStorage.getItem(storageKey));}
    catch {state.storageAvailable=false;}
    updateStorageNote();
  }
  function updateStorageNote() {
    $('storage-note').textContent=state.storageAvailable?'저장한 동네는 이 브라우저에 보관됩니다.':'브라우저 저장을 사용할 수 없어, 현재 화면을 열어둔 동안만 보관됩니다.';
  }
  function syncSaveButtons() {
    document.querySelectorAll('[data-save-area]').forEach(button=>{
      const area=state.areas.find(a=>a.id===button.dataset.saveArea);
      if(!area)return;
      const saved=state.saved.has(area.id);
      button.classList.toggle('is-saved',saved);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',area.name+(saved?' 저장 해제':' 저장'));
    });
    $('saved-count').textContent=state.saved.size;
    $('toolbar-saved-count').textContent=state.saved.size;
    $('toolbar-saved-count').hidden=!state.saved.size;
    $('open-saved').setAttribute('aria-label','저장한 동네 '+state.saved.size+'개 보기');
  }
  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;
    toastTimer=setTimeout(()=>{$('toast').hidden=true;},2400);
  }
  function toggleSaved(id,button) {
    const area=state.areas.find(a=>a.id===id);if(!area)return;
    const inList=!!button.closest('#area-list');
    const previousIndex=inList?Array.from($('area-list').querySelectorAll('[data-save-area]')).indexOf(button):-1;
    const saved=!state.saved.has(id);if(saved)state.saved.add(id);else state.saved.delete(id);
    try {localStorage.setItem(storageKey,JSON.stringify(Array.from(state.saved)));state.storageAvailable=true;}
    catch {state.storageAvailable=false;}
    updateStorageNote();
    if(state.savedOnly)renderDirectory();else {syncSaveButtons();renderPeek();}
    toast(area.mapName+(saved?' 저장했어요.':' 저장을 해제했어요.')+(saved&&!state.storageAvailable?' 현재 화면에서만 유지됩니다.':''));
    if(inList&&state.savedOnly){
      const remaining=$('area-list').querySelectorAll('[data-save-area]');
      (remaining[Math.min(previousIndex,remaining.length-1)]||$('reset-filters')).focus({preventScroll:true});
    }
  }
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey&&event.key!==null)return;
    state.saved=parseSaved(event.key===null?null:event.newValue);
    if(state.savedOnly)renderDirectory();else{syncSaveButtons();renderPeek();}
  });

  function createSheet() {
    const app=$('app-main'),sheet=$('region-sheet'),zone=$('sheet-drag-zone');
    const preview=$('sheet-preview'),full=$('sheet-full-content'),scroll=$('sheet-scroll');
    let snap='peek',mode='directory',renderedRegion=null,heights={min:94,peek:280,full:650},visibleHeight=280,drag=null,suppressClickUntil=0,frame=0,directoryScroll=0;
    const regionScroll=new Map(),clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
    const selectedArea=()=>state.areas.find(a=>a.id===state.selected);
    function rememberScroll() {
      if(snap!=='full')return;
      if(mode==='directory'&&!full.hidden)directoryScroll=scroll.scrollTop;
      if(mode!=='directory'&&!preview.hidden&&sheet.dataset.expanded==='true'&&renderedRegion)regionScroll.set(renderedRegion,preview.scrollTop);
    }
    function updateHeader() {
      const area=mode!=='directory'&&selectedArea();
      const activity=mode==='place'&&area?.activities.find(a=>a.id===state.selectedActivity);
      const title=activity?(snap==='min'?(activity.navTitle||activity.title):area.mapName):area?(snap==='peek'?'선택한 동네':area.mapName):(state.savedOnly?'저장한 동네':'동네 둘러보기');
      $('sheet-title').firstChild.textContent=title+' ';
      $('sheet-count').textContent=activity?'사진 '+photosFor(activity).length+'장':area?area.activities.length+'개':(state.savedOnly?state.saved.size:state.areas.length||20);
      $('sheet-caption').textContent=activity?(snap==='full'?'사진과 설명을 넘겨보세요':'올리면 이 장소의 사진과 설명이 펼쳐져요'):area?(snap==='full'?'즐길 거리를 골라 사진과 설명을 살펴보세요':'올리면 이 동네의 즐길 거리가 펼쳐져요'):(snap==='full'?'마음에 드는 동네를 골라보세요':'영역을 누르거나 목록을 끌어 올려보세요');
      $('sheet-expand-label').textContent=snap==='full'?'지도 보기':activity?'장소 펼치기':area?'지역 펼치기':'목록 펼치기';
      for(const id of ['sheet-expand','sheet-handle']){
        $(id).setAttribute('aria-expanded',String(snap==='full'));
        $(id).setAttribute('aria-controls',area?'map-selection':'sheet-full-content');
      }
      $('sheet-handle').setAttribute('aria-label',snap==='full'?'아래 정보를 접고 지도 보기':activity?activity.title+' 정보를 전체 화면으로 펼치기':area?area.name+' 정보를 전체 화면으로 펼치기':'동네 목록을 전체 화면으로 펼치기');
      $('sheet-minimize').hidden=snap==='min';
    }
    function present(expanded,hidden=false) {
      const region=mode!=='directory'&&!!selectedArea();
      sheet.dataset.contentMode=region?mode:'directory';
      sheet.dataset.expanded=String(expanded);
      preview.hidden=hidden||(!region&&expanded);
      full.hidden=hidden||region||!expanded;
      $('map-selection').hidden=!region;
      $('peek-discover').hidden=region;
      $('selected-region-details').hidden=!region||mode!=='region'||!expanded;
      $('selected-place-details').hidden=!region||mode!=='place'||!expanded;
      $('place-activity-footer').hidden=hidden||!region||mode!=='place'||!expanded;
    }
    function paint(height) {
      visibleHeight=height;
      app.style.setProperty('--sheet-height',height+'px');sheet.style.setProperty('--sheet-height',height+'px');
      sheet.dataset.visibleHeight=height.toFixed(1);
      if(mapApi)mapApi.refreshLabels();
    }
    function measure() {
      const viewHeight=window.visualViewport?.height||window.innerHeight||app.clientHeight;
      app.style.setProperty('--app-height',viewHeight+'px');
      const toolbar=$('map-toolbar').getBoundingClientRect();
      const toolbarBottom=toolbar.bottom||Math.min(74,viewHeight*.16);
      app.style.setProperty('--toolbar-bottom',toolbarBottom+'px');
      const safe=$('safe-area-bottom').clientHeight||0,short=viewHeight<=520;
      app.dataset.compactViewport=String(short);
      app.dataset.compactSearch=String(short&&document.activeElement===$('area-search'));
      const header=zone.offsetHeight||(short?70:90);
      const max=Math.max(header+safe,viewHeight-toolbarBottom-10);
      // Expanded activities never feed back into the compact sheet's measured height.
      const row=document.querySelector('.map-selection-preview'),actions=document.querySelector('.map-selection-actions');
      const content=mode!=='directory'&&selectedArea()?(row.offsetHeight||(short?60:80))+(actions.offsetHeight||(short?40:46))+(parseFloat(getComputedStyle(actions).marginTop)||11):($('peek-discover').offsetHeight||130);
      const min=Math.min(max,Math.max(short?70:82,header)+safe+5);
      const desired=header+Math.max(short?76:130,content)+(short?12:20)+safe;
      heights={min,peek:clamp(desired,min,max),full:max};
      app.style.setProperty('--sheet-full-height',max+'px');sheet.style.setProperty('--sheet-full-height',max+'px');
      if(!drag)paint(heights[snap]);
    }
    function set(next,options={}) {
      if(!['min','peek','full'].includes(next))return;
      if(drag)releaseDrag();
      if(options.remember!==false)rememberScroll();
      const focus=document.activeElement,previousRegion=renderedRegion;
      if(options.mode)mode=options.mode;
      if(mode!=='directory'&&!selectedArea())mode='directory';
      renderedRegion=mode==='place'?'place:'+state.selectedActivity:mode==='region'?'region:'+state.selected:null;
      const showPreview=next!=='min'&&(mode!=='directory'||next==='peek');
      const showDirectory=next==='full'&&mode==='directory';
      const hidingFocus=(!showDirectory&&full.contains(focus))||(!showPreview&&preview.contains(focus))||((next!=='full'||mode!=='region')&&$('selected-region-details').contains(focus))||((next!=='full'||mode!=='place')&&($('selected-place-details').contains(focus)||$('place-activity-footer').contains(focus)))||(next==='min'&&focus===$('sheet-minimize'));
      snap=next;sheet.dataset.snap=snap;document.body.dataset.sheet=snap;
      present(snap==='full',snap==='min');
      $('map-screen').inert=snap==='full';
      updateHeader();measure();
      if(snap==='full'){
        if(mode==='directory')scroll.scrollTop=directoryScroll;
        else preview.scrollTop=regionScroll.get(renderedRegion)||0;
      }else if(previousRegion!==renderedRegion||mode!=='directory')preview.scrollTop=0;
      if(hidingFocus||options.focus)$('sheet-handle').focus({preventScroll:true});
    }
    function refresh() {updateHeader();measure();}
    function releaseDrag() {
      const current=drag;drag=null;document.body.classList.remove('sheet-dragging');
      if(current&&zone.hasPointerCapture?.(current.id))zone.releasePointerCapture(current.id);
    }
    function cancelDrag() {if(!drag)return;const start=drag.snap;releaseDrag();set(start);}
    function onPointerDown(event) {
      if(drag&&event.pointerId!==drag.id){cancelDrag();return;}
      if(event.isPrimary===false||event.button>0||event.target.closest('a,input,select,button:not(#sheet-handle)'))return;
      rememberScroll();suppressClickUntil=0;
      drag={id:event.pointerId,startY:event.clientY,startX:event.clientX,startHeight:visibleHeight,snap,moved:false,lastY:event.clientY,time:performance.now()};
    }
    zone.addEventListener('pointerdown',onPointerDown);
    zone.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const dy=event.clientY-drag.startY,dx=event.clientX-drag.startX;
      if(!drag.moved&&Math.abs(dy)<6)return;
      if(!drag.moved&&Math.abs(dx)>Math.abs(dy)*1.4){cancelDrag();return;}
      if(!drag.moved){drag.moved=true;zone.setPointerCapture?.(drag.id);document.body.classList.add('sheet-dragging');}
      event.preventDefault();drag.lastY=event.clientY;
      const height=clamp(drag.startHeight-dy,heights.min,heights.full);
      present(height>heights.peek+35,height<heights.min+20);paint(height);
    },{passive:false});
    zone.addEventListener('pointerup',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      const current=drag;
      if(!current.moved){releaseDrag();return;}
      event.preventDefault();suppressClickUntil=performance.now()+450;
      const dy=event.clientY-current.startY,velocity=dy/Math.max(100,performance.now()-current.time);
      const projected=clamp(visibleHeight-velocity*90,heights.min,heights.full);
      const target=Object.keys(heights).reduce((best,key)=>Math.abs(heights[key]-projected)<Math.abs(heights[best]-projected)?key:best,'min');
      releaseDrag();set(target);
    });
    zone.addEventListener('pointercancel',cancelDrag);
    zone.addEventListener('lostpointercapture',event=>{if(drag&&event.target===zone&&event.pointerId===drag.id)cancelDrag();});
    zone.addEventListener('click',event=>{
      if(performance.now()<suppressClickUntil&&(event.target===zone||event.target.closest('#sheet-handle'))){event.preventDefault();event.stopImmediatePropagation();suppressClickUntil=0;}
    },true);
    document.addEventListener('pointerdown',event=>{if(drag&&event.pointerId!==drag.id)cancelDrag();},true);
    window.addEventListener('blur',cancelDrag);
    const toggle=()=>set(snap==='full'?'peek':'full');
    $('sheet-handle').addEventListener('click',toggle);
    $('sheet-expand').addEventListener('click',toggle);
    $('sheet-minimize').addEventListener('click',()=>set('min'));
    $('sheet-handle').addEventListener('keydown',event=>{
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();
      const steps=['min','peek','full'].filter((key,index,array)=>!index||heights[key]>heights[array[index-1]]+1),i=steps.indexOf(snap);
      set(event.key==='Home'?'min':event.key==='End'?'full':steps[clamp(i+(event.key==='ArrowUp'?1:-1),0,steps.length-1)]);
    });
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!document.querySelector('dialog[open]')&&snap!=='min'){event.preventDefault();$('area-search').blur();set(snap==='full'?'peek':'min');}
    });
    const onResize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{cancelDrag();refresh();});};
    window.addEventListener('resize',onResize,{passive:true});window.visualViewport?.addEventListener('resize',onResize,{passive:true});
    set((window.visualViewport?.height||window.innerHeight)<=680?'min':'peek');
    return {set,refresh,remember:rememberScroll,get mode(){return mode;},get snap(){return snap;},get height(){return visibleHeight;},get peekHeight(){return heights.peek;},get topInset(){return ($('map-toolbar').getBoundingClientRect().bottom||74)+57;},minimizeForMap(){if(snap!=='min'&&!drag)set('min');}};
  }

  function showSaved() {state.savedOnly=true;renderDirectory();sheetApi.set('full',{mode:'directory'});}
  document.addEventListener('click',event=>{
    const save=event.target.closest('[data-save-area]');if(save){toggleSaved(save.dataset.saveArea,save);return;}
    const selectedActivity=event.target.closest('.selected-activity-card[data-selected-activity]');
    if(selectedActivity&&state.selected){openArea(state.selected,selectedActivity,Number(selectedActivity.dataset.selectedActivity));return;}
    const placeActivity=event.target.closest('[data-place-activity]');
    if(placeActivity&&mapApi){mapApi.selectActivity(placeActivity.dataset.placeActivity,{reveal:false,bringIntoView:false});return;}
    const photoStep=event.target.closest('[data-place-photo-step]');
    if(photoStep){moveSelectedPlacePhoto(Number(photoStep.dataset.placePhotoStep));return;}
    const photoIndex=event.target.closest('[data-place-photo-index]');
    if(photoIndex){state.selectedPhoto=Number(photoIndex.dataset.placePhotoIndex);renderSelectedPlacePhoto();return;}
    const category=event.target.closest('[data-category]');if(category){state.category=category.dataset.category;renderDirectory();$('sheet-scroll').scrollTop=0;return;}
    const area=event.target.closest('.area-tile[data-area],.peek-card[data-area]');
    if(area&&mapApi)mapApi.select(area.dataset.area,{initialPage:area.hasAttribute('data-initial-page')?Number(area.dataset.initialPage):undefined});
  });
  document.querySelector('.skip-link').addEventListener('click',event=>{event.preventDefault();sheetApi.set('full',{focus:true,mode:'directory'});});
  $('area-search').addEventListener('focus',()=>{if(sheetApi)sheetApi.set('full',{mode:'directory'});});
  $('area-search').addEventListener('blur',()=>requestAnimationFrame(()=>sheetApi?.refresh()));
  $('area-search').addEventListener('input',event=>{state.query=event.target.value;renderDirectory();sheetApi.set('full',{mode:'directory'});$('sheet-scroll').scrollTop=0;});
  $('area-search').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.target.blur();}});
  $('clear-search').addEventListener('click',()=>{state.query='';$('area-search').value='';renderDirectory();$('area-search').focus();});
  $('reset-filters').addEventListener('click',()=>{state.query='';state.category='all';state.savedOnly=false;$('area-search').value='';renderDirectory();sheetApi.set('full',{mode:'directory'});$('sheet-scroll').scrollTop=0;$('all-filter').focus({preventScroll:true});});
  $('open-saved').addEventListener('click',showSaved);$('saved-filter').addEventListener('click',showSaved);
  $('all-filter').addEventListener('click',()=>{state.savedOnly=false;renderDirectory();});
  $('retry-load').addEventListener('click',()=>location.reload());
  function makeDirectory() {
    renderDirectory();
    const total=state.areas.reduce((sum,area)=>sum+area.activities.length,0);
    const photoTotal=state.areas.reduce((sum,area)=>sum+area.activities.reduce((n,a)=>n+photosFor(a).length,0),0);
    $('all-count').textContent=state.areas.length;
    $('scope-count').textContent='지하철로 가는 '+total+'개 즐길 거리';
    $('about-summary').textContent='2박 3일 여행에서 고르기 편하도록 도쿄 시내 '+state.areas.length+'개 지역, '+total+'개 즐길 거리와 사진 '+photoTotal+'장을 모았습니다. 지역마다 항목 수가 다르며, 지도와 목록에서 개수를 확인할 수 있습니다.';
  }

  function openArea(id, opener, initialPage) {
    const area = state.areas.find(a => a.id === id);
    if (!area) return;
    state.current = area;
    const last = initialPage == null ? state.lastActivities.get(id) || 0 : initialPage;
    state.page = Math.max(0, Math.min(last, area.activities.length - 1));
    state.opener = opener || document.activeElement;
    $('region-count').textContent = '즐길 거리 ' + area.activities.length + '개';
    $('region-title').textContent = area.name;
    $('save-current-area').dataset.saveArea=area.id;
    syncSaveButtons();
    $('region-kicker').textContent = area.kicker;
    $('region-access').innerHTML = '<span>' + esc(area.access.station) + '</span>' +
      (area.access.lines || []).map(line => '<span class="line-chip"><i aria-hidden="true"></i>' + esc(typeof line === 'string' ? line : line.name) + '</span>').join('');
    $('activity-tabs').innerHTML = area.activities.map((a, i) => '<button class="activity-tab" type="button" data-page="' + i + '" aria-current="' + (i === state.page) + '">' + esc(a.navTitle || a.title) + '</button>').join('');
    document.querySelectorAll('[data-area]').forEach(el => el.classList.toggle('active', el.dataset.area === id));
    if (mapApi&&!(sheetApi.mode==='place'&&state.selected===id)) mapApi.select(id,{reveal:false,bringIntoView:false});
    renderActivity(false);
    if (!dialog.open) dialog.showModal();
    syncScrollLock();
    $('close-region').focus({preventScroll:true});
    requestAnimationFrame(() => { revealActiveTab(); revealActivePhoto(); });
  }

  function revealActiveTab() {
    const nav = $('activity-tabs');
    const active = nav.querySelector('[aria-current="true"]');
    if (!active) return;
    const padding = 10;
    const left = active.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft + padding) nav.scrollLeft = Math.max(0, left - padding);
    else if (left + active.offsetWidth > nav.scrollLeft + nav.clientWidth - padding) nav.scrollLeft = left + active.offsetWidth - nav.clientWidth + padding;
  }

  function revealActivePhoto() {
    const strip = $('activity-content').querySelector('.photo-thumbnails');
    const active = strip && strip.querySelector('[aria-pressed="true"]');
    if (!active || !strip.clientWidth) return;
    const bounds = strip.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    const padding = 7;
    if (item.left < bounds.left + padding) strip.scrollLeft = Math.max(0, strip.scrollLeft + item.left - bounds.left - padding);
    else if (item.right > bounds.right - padding) strip.scrollLeft += item.right - bounds.right + padding;
  }

  function renderActivity(announce) {
    const area = state.current;
    const activity = currentActivity();
    const restoreContentFocus = $('activity-content').contains(document.activeElement);
    const photos = photosFor(activity);
    state.lastActivities.set(area.id, state.page);
    state.photo = Math.min(state.lastPhotos.get(activity.id) || 0, photos.length - 1);
    const primarySource = (activity.sources || []).find(s => /^https:/.test(s.url));
    const googleMaps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(activity.mapQuery || activity.title + ' Tokyo');
    $('activity-content').innerHTML =
      '<figure class="photo-gallery" role="group" aria-label="' + esc(activity.title) + ' 사진 갤러리">' +
      '<div class="gallery-stage" data-photo-swipe><img class="activity-image" id="gallery-image" src="' + esc(photos[state.photo].src) + '" alt="' + esc(photos[state.photo].alt) + '" width="1200" height="900" draggable="false">' +
      '<span id="photo-counter" class="photo-counter" aria-live="polite"></span><button type="button" class="photo-arrow previous" data-photo-step="-1" aria-label="이전 사진">‹</button><button type="button" class="photo-arrow next" data-photo-step="1" aria-label="다음 사진">›</button></div>' +
      '<div class="gallery-tools"><div class="photo-thumbnails" role="group" aria-label="사진 선택">' +
      photos.map((photo, i) => '<button type="button" class="photo-thumb" data-photo-index="' + i + '" aria-label="사진 ' + (i+1) + ': ' + esc(photo.alt) + '" title="' + esc(photo.view || photo.alt) + '" aria-pressed="' + (i === state.photo) + '"><img src="' + esc(photo.thumb || photo.src) + '" alt="" width="62" height="44" loading="lazy"></button>').join('') +
      '</div><button type="button" class="photo-enlarge" data-gallery-open>사진 크게 보기 ↗</button></div><figcaption id="gallery-caption" class="gallery-caption"></figcaption><p id="gallery-source" class="gallery-source"></p></figure>' +
      '<div class="activity-info"><div class="activity-topline"><span class="activity-type">' + esc(activity.eyebrow) + '</span><span class="activity-duration">' + esc(activity.duration) + ' · 체류 예상</span></div>' +
      '<h3 id="activity-title" tabindex="-1">' + esc(activity.title) + '</h3><p class="activity-description">' + esc(activity.description) + '</p>' +
      '<ul class="activity-highlights">' + activity.highlights.map(text => '<li>' + esc(text) + '</li>').join('') + '</ul>' +
      '<dl class="activity-practical"><dt>가는 길</dt><dd>' + esc(activity.station) + ' · ' + esc(activity.walk) + '</dd><dt>참고</dt><dd>' + esc(activity.tip) + '</dd></dl>' +
      '<div class="activity-actions">' + external(googleMaps, '지도에서 위치 보기 ↗', 'action-link primary') +
      (primarySource ? external(primarySource.url, '공식 안내 ↗', 'action-link') : '') + '</div></div>';
    $('activity-tabs').querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', String(i === state.page)));
    $('page-label').textContent = (state.page + 1) + ' / ' + area.activities.length;
    $('previous-activity').disabled = state.page === 0;
    $('next-activity').disabled = state.page === area.activities.length - 1;
    $('previous-activity').setAttribute('aria-label', state.page > 0 ? '이전 즐길 거리: ' + area.activities[state.page-1].title : '첫 번째 즐길 거리입니다');
    $('next-activity').setAttribute('aria-label', state.page < area.activities.length-1 ? '다음 즐길 거리: ' + area.activities[state.page+1].title : '마지막 즐길 거리입니다');
    $('activity-viewport').scrollTop = 0;
    dialog.dataset.area = area.id;
    dialog.dataset.page = String(state.page + 1);
    renderPhoto();
    revealActiveTab();
    if (announce && restoreContentFocus) $('activity-title').focus({preventScroll:true});
    const next = area.activities[state.page+1];
    if (next) { const image = new Image(); image.src = photosFor(next)[0].src; }
  }

  function renderPhoto() {
    const activity = currentActivity();
    if (!activity) return;
    const photos = photosFor(activity);
    const photo = photos[state.photo];
    const image = $('gallery-image');
    if (image) { image.src = photo.src; image.alt = photo.alt; }
    $('photo-counter').textContent = '사진 ' + (state.photo + 1) + ' / ' + photos.length;
    $('gallery-caption').textContent = photo.caption;
    $('gallery-source').innerHTML = '<span>' + esc(photo.credit) + '</span> ' + photoLinks(photo, '사진 출처 ↗');
    document.querySelectorAll('[data-photo-step]').forEach(button => {
      const delta = Number(button.dataset.photoStep);
      button.disabled = delta < 0 ? state.photo === 0 : state.photo === photos.length-1;
    });
    $('activity-content').querySelectorAll('[data-photo-index]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.photoIndex) === state.photo)));
    revealActivePhoto();
    dialog.dataset.photo = String(state.photo+1);
    state.lastPhotos.set(activity.id, state.photo);
    if (photoDialog.open) renderLightbox();
    const next = photos[state.photo+1];
    if (next) { const preload = new Image(); preload.src = next.src; }
  }

  function renderLightbox() {
    const activity = currentActivity();
    const photos = photosFor(activity);
    const photo = photos[state.photo];
    $('lightbox-title').textContent = activity.title;
    $('lightbox-image').src = photo.src;
    $('lightbox-image').alt = photo.alt;
    $('lightbox-counter').textContent = '사진 ' + (state.photo+1) + ' / ' + photos.length;
    $('lightbox-caption').textContent = photo.caption;
  }

  function movePhoto(delta) {
    const activity = currentActivity();
    if (!activity) return;
    const next = state.photo + delta;
    if (next < 0 || next >= photosFor(activity).length) return;
    state.photo = next;
    renderPhoto();
  }

  function movePage(delta) {
    if (!state.current) return;
    const index = state.page + delta;
    if (index < 0 || index >= state.current.activities.length) return;
    state.page = index;
    renderActivity(true);
  }

  $('activity-tabs').addEventListener('click', event => {
    const target = event.target.closest('[data-page]');
    if (!target) return;
    state.page = Number(target.dataset.page);
    renderActivity(true);
  });
  $('previous-activity').addEventListener('click', () => movePage(-1));
  $('next-activity').addEventListener('click', () => movePage(1));
  $('close-region').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (photoDialog.open) photoDialog.close();
    syncScrollLock();
    if (state.opener && document.contains(state.opener)) state.opener.focus({preventScroll:true});
    else $('sheet-handle').focus({preventScroll:true});
  });
  function closeOnBackdrop(event, target) {
    if (event.target !== target) return;
    const box = target.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) target.close();
  }
  dialog.addEventListener('click', event => closeOnBackdrop(event, dialog));
  dialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || photoDialog.open) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    if (event.target.closest('.photo-gallery')) movePhoto(delta);
    else movePage(delta);
  });
  function handlePhotoClick(event) {
    const step = event.target.closest('[data-photo-step]');
    const choice = event.target.closest('[data-photo-index]');
    const enlarge = event.target.closest('[data-gallery-open]');
    if (step) movePhoto(Number(step.dataset.photoStep));
    else if (choice) { state.photo = Number(choice.dataset.photoIndex); renderPhoto(); }
    else if (enlarge) {
      renderLightbox();
      photoDialog.showModal();
      syncScrollLock();
      $('close-photo').focus({preventScroll:true});
    }
  }
  $('activity-content').addEventListener('click', handlePhotoClick);
  photoDialog.addEventListener('click', event => {
    handlePhotoClick(event);
    closeOnBackdrop(event, photoDialog);
  });
  $('close-photo').addEventListener('click', () => photoDialog.close());
  photoDialog.addEventListener('close', syncScrollLock);
  photoDialog.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();event.stopPropagation();
      movePhoto(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  let swipeStart = null;
  function bindPhotoSwipe(container) {
    container.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button > 0 || !event.target.closest('[data-photo-swipe]') || event.target.closest('button,a')) return;
      swipeStart = {x:event.clientX,y:event.clientY,id:event.pointerId,container};
      if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
    }, {passive:true});
    container.addEventListener('pointerup', event => {
      if (!swipeStart || swipeStart.container !== container || swipeStart.id !== event.pointerId) return;
      const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
      if(Math.abs(dx)>55 && Math.abs(dx)>Math.abs(dy)*1.3) movePhoto(dx<0?1:-1);
      swipeStart=null;
    }, {passive:true});
    container.addEventListener('pointercancel',()=>{swipeStart=null;},{passive:true});
    container.addEventListener('lostpointercapture',()=>{if(swipeStart && swipeStart.container===container)swipeStart=null;},{passive:true});
  }
  bindPhotoSwipe($('activity-viewport'));
  bindPhotoSwipe(photoDialog);

  function makeSources() {
    $('source-list').innerHTML = state.areas.map(area => '<section class="source-region"><h3>' + esc(area.name) + '</h3>' +
      area.activities.map(a => '<div class="source-item"><strong>' + esc(a.title) + '</strong>' +
      photosFor(a).map((photo,i) => '<div class="photo-credit-row"><span>사진 ' + (i+1) + ' · ' + esc(photo.credit) + '</span> ' + photoLinks(photo, '출처') + '</div>').join('') +
      '<div>' + (a.sources || []).map(s => external(s.url, s.label || '공식 안내')).join(' · ') + '</div></div>').join('') + '</section>').join('');
  }
  function openAbout(sources) {
    $('source-details').open = !!sources;
    aboutDialog.showModal();
    syncScrollLock();
  }
  $('about-button').addEventListener('click', () => openAbout(false));
  $('sources-button').addEventListener('click', () => openAbout(true));
  $('close-about').addEventListener('click', () => aboutDialog.close());
  aboutDialog.addEventListener('close', syncScrollLock);
  aboutDialog.addEventListener('click', event => closeOnBackdrop(event, aboutDialog));

  function renderSelectedRegion(area) {
    const image=$('map-selection-image');
    if(!area){image.removeAttribute('src');$('map-save-area').removeAttribute('data-save-area');return;}
    const cover=coverFor(area);
    image.src=cover.src;image.style.objectPosition=cover.position||'50% 50%';
    $('map-selection').setAttribute('aria-label','선택한 동네 정보');
    $('map-selection-eyebrow').textContent='YOUR NEXT STOP';
    $('map-save-area').dataset.saveArea=area.id;
    $('map-selection-title').textContent=area.name;
    $('map-selection-summary').textContent=area.kicker;
    $('map-selection-access').textContent=area.access.station;
    $('map-open-label').textContent='즐길 거리 '+area.activities.length+'개 보기';
    $('selected-region-summary').textContent=area.summary;
    $('selected-region-access').innerHTML=icon('train')+'<div><strong>'+esc(area.access.station)+'</strong><span>'+esc(area.access.walk)+'</span></div>';
    $('selected-activity-count').textContent=area.activities.length+'개';
    $('selected-activity-list').innerHTML=area.activities.map((activity,index)=>{
      const photos=photosFor(activity),photo=photos[0];
      return '<button class="selected-activity-card" type="button" data-selected-activity="'+index+'" aria-label="'+esc(activity.title)+' · 사진 '+photos.length+'장과 설명 보기"><span class="selected-activity-photo"><img src="'+esc(photo.thumb||photo.src)+'" alt="" width="112" height="112" loading="lazy"><span>사진 '+photos.length+'장</span></span><span class="selected-activity-copy"><span class="selected-activity-type">'+esc(activity.eyebrow)+'</span><strong>'+esc(activity.navTitle||activity.title)+'</strong><span class="selected-activity-description">'+esc(activity.description)+'</span><span class="selected-activity-duration">'+esc(activity.duration.replace(' (계획용 추정)',''))+'</span></span>'+icon('arrow')+'</button>';
    }).join('');
  }

  function selectedPlaceActivity() {
    return state.areas.find(a=>a.id===state.selected)?.activities.find(a=>a.id===state.selectedActivity);
  }
  function renderSelectedPlace(area,activity,place) {
    const photos=photosFor(activity),image=$('map-selection-image');
    state.selectedPhoto=Math.min(state.lastPhotos.get(activity.id)||0,photos.length-1);
    image.src=photos[state.selectedPhoto].thumb||photos[state.selectedPhoto].src;image.style.objectPosition='50% 50%';
    $('map-selection').setAttribute('aria-label','선택한 장소 정보');
    $('map-selection-eyebrow').textContent=area.mapName+' · '+activity.eyebrow;
    $('map-save-area').dataset.saveArea=area.id;
    $('map-selection-title').textContent=activity.title;
    $('map-selection-summary').textContent=activity.duration.replace(' (계획용 추정)','')+' · 사진 '+photos.length+'장';
    $('map-selection-access').textContent=activity.station;
    $('map-open-label').textContent='사진과 설명 크게 보기';
    $('place-description').textContent=activity.description;
    $('place-highlights').innerHTML=activity.highlights.map(value=>'<li>'+esc(value)+'</li>').join('');
    $('place-duration').textContent=activity.duration+' · 체류 예상';
    $('place-access').textContent=activity.station+' · '+activity.walk;
    $('place-tip').textContent=activity.tip;
    const primarySource=(activity.sources||[]).find(s=>/^https:/.test(s.url));
    const googleMaps='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(activity.mapQuery||activity.title+' Tokyo');
    $('place-links').innerHTML=external(googleMaps,'지도에서 위치 보기 ↗','action-link primary')+(primarySource?external(primarySource.url,'공식 안내 ↗','action-link'):'');
    const siblings=place.activityIds.map(id=>area.activities.find(a=>a.id===id)).filter(Boolean);
    $('selected-place-siblings').hidden=siblings.length<2;
    $('selected-place-siblings').innerHTML=siblings.length<2?'':'<span class="place-siblings-label">'+esc(place.name)+' · 이 장소·단지의 즐길 거리 '+siblings.length+'개</span><div class="place-sibling-options">'+siblings.map(item=>'<button type="button" data-place-activity="'+esc(item.id)+'" aria-pressed="'+String(item.id===activity.id)+'">'+esc(item.navTitle||item.title)+'</button>').join('')+'</div>';
    $('place-photo-thumbnails').innerHTML=photos.map((photo,i)=>'<button type="button" class="photo-thumb" data-place-photo-index="'+i+'" aria-label="사진 '+(i+1)+': '+esc(photo.alt)+'" aria-pressed="'+String(i===state.selectedPhoto)+'"><img src="'+esc(photo.thumb||photo.src)+'" alt="" width="62" height="44" loading="lazy"></button>').join('');
    $('place-parent-region').textContent=area.name+'의 즐길 거리 '+area.activities.length+'개 모두 보기 →';
    const page=area.activities.indexOf(activity);
    $('place-activity-page').textContent=(page+1)+' / '+area.activities.length;
    $('previous-place-activity').disabled=page===0;
    $('next-place-activity').disabled=page===area.activities.length-1;
    $('previous-place-activity').setAttribute('aria-label',page?'이전 즐길 거리: '+area.activities[page-1].title:'첫 번째 즐길 거리입니다');
    $('next-place-activity').setAttribute('aria-label',page<area.activities.length-1?'다음 즐길 거리: '+area.activities[page+1].title:'마지막 즐길 거리입니다');
    $('selected-place-details').dataset.activityId=activity.id;
    $('selected-place-details').dataset.placeId=place.id;
    renderSelectedPlacePhoto();
  }
  function renderSelectedPlacePhoto() {
    const activity=selectedPlaceActivity();if(!activity)return;
    const photos=photosFor(activity);
    state.selectedPhoto=Math.max(0,Math.min(photos.length-1,state.selectedPhoto));
    const photo=photos[state.selectedPhoto];
    $('place-photo-image').src=photo.src;$('place-photo-image').alt=photo.alt;
    $('place-photo-counter').textContent='사진 '+(state.selectedPhoto+1)+' / '+photos.length;
    $('place-photo-caption').textContent=photo.caption;
    $('place-photo-source').innerHTML='<span>'+esc(photo.credit)+'</span> '+photoLinks(photo,'사진 출처 ↗');
    $('selected-place-details').dataset.photo=String(state.selectedPhoto+1);
    document.querySelectorAll('[data-place-photo-step]').forEach(button=>{button.disabled=Number(button.dataset.placePhotoStep)<0?state.selectedPhoto===0:state.selectedPhoto===photos.length-1;});
    $('place-photo-thumbnails').querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===state.selectedPhoto)));
    const strip=$('place-photo-thumbnails'),active=strip.querySelector('[aria-pressed="true"]');
    if(active&&strip.clientWidth){
      const frame=strip.getBoundingClientRect(),box=active.getBoundingClientRect();
      if(box.left<frame.left+7)strip.scrollLeft=Math.max(0,strip.scrollLeft+box.left-frame.left-7);
      else if(box.right>frame.right-7)strip.scrollLeft+=box.right-frame.right+7;
    }
    state.lastPhotos.set(activity.id,state.selectedPhoto);
  }
  function moveSelectedPlacePhoto(delta) {
    const activity=selectedPlaceActivity();if(!activity)return;
    const next=state.selectedPhoto+delta;
    if(next<0||next>=photosFor(activity).length)return;
    state.selectedPhoto=next;renderSelectedPlacePhoto();
  }
  function moveSelectedPlaceActivity(delta) {
    const area=state.areas.find(a=>a.id===state.selected);if(!area||!mapApi)return;
    const index=area.activities.findIndex(a=>a.id===state.selectedActivity)+delta;
    if(index<0||index>=area.activities.length)return;
    mapApi.selectActivity(area.activities[index].id,{reveal:false,bringIntoView:false});
  }
  $('previous-place-activity').addEventListener('click',()=>moveSelectedPlaceActivity(-1));
  $('next-place-activity').addEventListener('click',()=>moveSelectedPlaceActivity(1));
  $('place-parent-region').addEventListener('click',()=>{if(state.selected)mapApi.select(state.selected,{reveal:false,bringIntoView:false});});
  let placeSwipe=null;
  const placeStage=$('place-photo-stage');
  placeStage.addEventListener('pointerdown',event=>{
    if(event.isPrimary===false||event.button>0||event.target.closest('button,a'))return;
    placeSwipe={id:event.pointerId,x:event.clientX,y:event.clientY};
    placeStage.setPointerCapture?.(event.pointerId);
  },{passive:true});
  placeStage.addEventListener('pointerup',event=>{
    if(!placeSwipe||placeSwipe.id!==event.pointerId)return;
    const dx=event.clientX-placeSwipe.x,dy=event.clientY-placeSwipe.y;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3)moveSelectedPlacePhoto(dx<0?1:-1);
    placeSwipe=null;
    if(placeStage.hasPointerCapture?.(event.pointerId))placeStage.releasePointerCapture(event.pointerId);
  },{passive:true});
  for(const event of ['pointercancel','lostpointercapture'])placeStage.addEventListener(event,()=>{placeSwipe=null;},{passive:true});
  $('selected-place-details').addEventListener('keydown',event=>{
    if(event.altKey||event.ctrlKey||event.metaKey||!event.target.closest('.place-gallery'))return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveSelectedPlacePhoto(event.key==='ArrowLeft'?-1:1);}
  });

  function buildMap(outline,pois,zones,places) {
    const host=$('map'),labels=$('map-labels'),poiLabels=$('map-poi-labels');
    const map=L.map('map-basemap',{zoomControl:false,attributionControl:false,minZoom:3,maxZoom:18,zoomSnap:.25,zoomDelta:.75,preferCanvas:true,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false,trackResize:false,keyboard:true,scrollWheelZoom:true});
    map.getContainer().append(poiLabels,labels);
    const regionHost=document.createElement('div'),regionCanvas=document.createElement('div');
    regionHost.id='map-region-labels';regionHost.className='map-region-labels';regionHost.setAttribute('role','group');regionHost.setAttribute('aria-label','도쿄의 모든 지역 이름');
    regionCanvas.id='region-label-canvas';regionCanvas.className='region-label-canvas';regionHost.appendChild(regionCanvas);labels.appendChild(regionHost);
    const outlinePane=map.createPane('outline');outlinePane.style.zIndex='150';outlinePane.style.pointerEvents='none';
    const outlineLayer=L.geoJSON(outline,{pane:'outline',interactive:false,style:{color:'#c9d8e3',weight:.8,fillColor:'#f7f9fb',fillOpacity:1}}).addTo(map);
    const zonePane=map.createPane('travel-zones');zonePane.style.zIndex='410';
    let programmatic=0,width=0,height=0,selected=null,controlsBounds=null,ready=false,resizeTimer,successes=0,failures=0,regionMode='regions';
    const camera=action=>{programmatic++;try{return action();}finally{programmatic--;}};
    const areaLookup=new Map(state.areas.map(area=>[area.id,area]));
    const zoneLookup=new Map(zones.features.map(feature=>[feature.properties.areaId,feature]));
    const activityLookup=new Map(state.areas.flatMap(area=>area.activities.map((activity,index)=>[activity.id,{area,activity,index}])));
    const placeLookup=new Map(places.flatMap(place=>place.activityIds.map(id=>[id,place])));
    const tokyoBounds=L.latLngBounds(state.areas.map(a=>[a.lat,a.lon]));
    const airport=pois.find(p=>p.type==='airport'),chooser=$('map-area-select'),zoneLayers=new Map();
    const palette=['#699fbf','#719e92','#8d92b5','#769ab4','#94a48c'];
    const zoneStyle=feature=>{
      const active=feature.properties.areaId===selected,index=state.areas.findIndex(area=>area.id===feature.properties.areaId);
      const color=active?'#1178b8':palette[index%palette.length];
      return {className:'travel-zone',color,weight:active?2.4:1.4,opacity:active?.9:.7,fillColor:color,fillOpacity:active?.27:.17,lineCap:'round',lineJoin:'round'};
    };
    const travelLayer=L.geoJSON(zones,{pane:'travel-zones',interactive:true,style:zoneStyle,onEachFeature(feature,layer){
      zoneLayers.set(feature.properties.areaId,layer);
      layer.on('click',event=>{
        if(event.originalEvent?.defaultPrevented)return;
        selectArea(feature.properties.areaId);
      });
    }});
    // Compact map names; the directory, sheet and accessible labels keep the
    // complete neighborhood name and its activity count.
    const mapNames={shibuya:'시부야',harajuku_omotesando:'하라주쿠',shinjuku:'신주쿠',ikebukuro:'이케부쿠로',ebisu_daikanyama_nakameguro:'에비스',nakano:'나카노',ueno:'우에노',yanaka_nezu_sendagi:'야나카',akihabara:'아키하바라',asakusa:'아사쿠사',skytree_oshiage:'스카이트리',ryogoku:'료고쿠',kiyosumi_monzen:'기요스미',tokyo_marunouchi:'도쿄역',nihonbashi:'니혼바시',ginza_tsukiji:'긴자',dome:'고라쿠엔',roppongi:'롯폰기',azabudai:'도쿄타워',toyosu:'도요스'};
    const regionNodes=state.areas.map(area=>{
      const feature=zoneLookup.get(area.id),button=document.createElement('button'),mapName=mapNames[area.id]||area.name;
      button.type='button';button.className='map-label region-label';button.dataset.area=area.id;
      button.setAttribute('aria-label',area.name+' 여행 구역 · 즐길 거리 '+area.activities.length+'개 · 누르면 장소로 확대');button.setAttribute('aria-pressed','false');
      button.innerHTML='<span class="region-label-content"><span class="region-name">'+esc(mapName)+'</span></span>';
      button.addEventListener('click',event=>{
        if(event.defaultPrevented||(event.detail>0&&map.dragging.moved()&&!regionHost.classList.contains('is-reading')))return;
        let chosen=area;
        if(event.detail>0&&!event.target.closest('.region-label-content')&&!regionHost.classList.contains('is-reading')){
          const box=host.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
          // Transparent touch padding can overlap; resolve a padding tap to
          // the nearest visible name while direct text taps keep their identity.
          const nearest=regionNodes.filter(node=>!node.el.hidden&&node.placement).reduce((best,node)=>{
            const rect=node.placement.rect,dx=Math.max(rect.left-x,0,x-rect.right),dy=Math.max(rect.top-y,0,y-rect.bottom),distance=Math.hypot(dx,dy);
            return distance<best.distance?{node,distance}:best;
          },{node:null,distance:20});
          if(nearest.node)chosen=nearest.node.area;
        }
        selectArea(chosen.id);
      });
      L.DomEvent.on(button,'dblclick',L.DomEvent.stopPropagation);
      regionCanvas.appendChild(button);
      return {kind:'region',area,id:area.id,lat:feature.properties.labelLat,lon:feature.properties.labelLon,text:mapName,el:button,label:button.querySelector('.region-label-content'),placement:null};
    });
    function activityIcon(activity) {
      const text=activity.eyebrow+' '+activity.title;
      if(categoryPatterns.shopping.test(text))return 'shop';
      if(categoryPatterns.food.test(text))return 'food';
      if(categoryPatterns.relax.test(text))return 'leaf';
      return 'sparkles';
    }
    const placeNodes=places.map(place=>{
      const button=document.createElement('button'),activity=activityLookup.get(place.activityIds[0]).activity;
      button.type='button';button.className='place-pin';button.dataset.placeId=place.id;button.dataset.parentArea=place.areaId;button.dataset.activityIds=place.activityIds.join(',');
      button.setAttribute('aria-label',place.name+' · '+areaLookup.get(place.areaId).name+' · 즐길 거리 '+place.activityIds.length+'개');button.setAttribute('aria-pressed','false');
      button.innerHTML='<span class="place-pin-symbol" aria-hidden="true">'+icon(activityIcon(activity))+'</span>'+(place.activityIds.length>1?'<span class="place-pin-count" aria-hidden="true">'+place.activityIds.length+'</span>':'')+'<span class="poi-name">'+esc(place.name)+'</span>';
      button.addEventListener('click',event=>{
        if(event.defaultPrevented||(event.detail>0&&map.dragging.moved()))return;
        let chosen=place;
        // Closely spaced 44px touch targets resolve to the actual point nearest
        // the tap. A named label or keyboard activation always keeps its identity.
        if(event.detail>0&&!event.target.closest('.poi-name')){
          const rect=host.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
          const nearest=placeNodes.filter(node=>!node.el.hidden).reduce((best,node)=>{const distance=Math.hypot(x-node.x,y-node.y);return distance<best.distance?{node,distance}:best;},{node:null,distance:29});
          if(nearest.node)chosen=nearest.node.place;
        }
        const activityId=chosen.activityIds.includes(state.selectedActivity)?state.selectedActivity:chosen.activityIds[0];
        selectActivity(activityId);
      });
      L.DomEvent.on(button,'dblclick',L.DomEvent.stopPropagation);
      labels.appendChild(button);
      return {kind:'place',id:place.id,place,lat:place.lat,lon:place.lon,text:place.name,el:button,name:button.querySelector('.poi-name'),size:44};
    });
    // Curated place pins replace the old passive landmark/building labels.
    const orientationPois=pois.filter(poi=>poi.type==='station'||poi.type==='airport');
    const poiNodes=orientationPois.map(poi=>{
      const el=document.createElement('span');el.className='map-poi';el.dataset.poiId=poi.id;el.dataset.kind=poi.type;
      el.dataset.minZoom=String(poi.minZoom);el.setAttribute('role','img');el.setAttribute('aria-label',poi.name+' · '+(poi.scopeException?'공항 위치':poi.nearStation));el.title=poi.name+' · '+poi.accessNote;
      el.innerHTML='<span class="poi-symbol" aria-hidden="true">'+icon(poi.type==='station'?'train':'plane')+'</span><span class="poi-name">'+esc(poi.name)+'</span>';
      poiLabels.appendChild(el);
      return {kind:poi.type,id:poi.id,lat:poi.lat,lon:poi.lon,text:poi.name,poi,el,name:el.querySelector('.poi-name'),size:18};
    });
    $('map-poi-sources').innerHTML='<p>장소 핀 '+places.length+'개 · 즐길 거리 '+activityLookup.size+'개 · 지하철역 '+orientationPois.filter(p=>p.type==='station').length+'곳 · 나리타 공항</p>'+places.map(place=>'<div class="map-source-row"><strong>'+esc(place.name)+' · '+place.activityIds.length+'개 즐길 거리</strong><span>'+esc(place.coordinateNote)+'</span><span>'+external(place.sourceUrl,'공식 장소 안내')+' · '+external(place.coordinateSourceUrl,'좌표 출처')+'</span></div>').join('')+orientationPois.map(p=>'<div class="map-source-row"><strong>'+esc(p.name)+'</strong><span>'+esc(p.nearStation)+' · '+esc(p.accessNote)+'</span><span>'+external(p.sourceUrl,'공식 접근 안내')+' · '+external(p.coordinateSourceUrl,'좌표 출처')+'</span></div>').join('');

    function visibleFrame() {
      const top=(sheetApi?.topInset||131)+(!$('map-status').hidden?42:0),covered=sheetApi?.height||260;
      const bottom=sheetApi?.snap==='full'?top:Math.max(top,height-covered-31);
      return {left:22,right:Math.max(24,width-22),top:Math.min(top,height-75),bottom};
    }
    function controlBox() {
      const controls=document.querySelector('.map-controls'),w=controls.offsetWidth,h=controls.offsetHeight;if(!w||!h)return null;
      const style=getComputedStyle(controls),right=parseFloat(style.right)||13,gap=parseFloat(style.getPropertyValue('--controls-gap'))||32;
      const bottom=height-(sheetApi?.height||260)-gap;return {left:width-right-w,right:width-right,top:bottom-h,bottom};
    }
    const overlaps=(a,b,gap=4)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
    const blocksControl=rect=>controlsBounds&&overlaps(rect,controlsBounds,5);
    function setViewState(value) {
      host.dataset.view=value;for(const name of ['tokyo','japan','narita'])$(name+'-view').setAttribute('aria-pressed',String(name===value));
    }
    function fit(bounds,view,maxZoom) {
      width=host.clientWidth;height=host.clientHeight;
      const frame=visibleFrame(),bottom=Math.max(frame.top+45,frame.bottom),margin=Math.min(24,(bottom-frame.top)*.12);
      camera(()=>map.fitBounds(bounds,{animate:false,paddingTopLeft:[34,frame.top+margin],paddingBottomRight:[34,Math.max(20,height-bottom+margin)],maxZoom:maxZoom??(view==='tokyo'?12.5:11)}));
      setViewState(view);positionLabels();
    }
    function showView(view) {
      $('area-search').blur();sheetApi.minimizeForMap();
      if(view==='japan')fit(outlineLayer.getBounds(),'japan');
      else if(view==='narita'&&airport)fit(L.latLngBounds(tokyoBounds.getSouthWest(),tokyoBounds.getNorthEast()).extend([airport.lat,airport.lon]),'narita');
      else fit(tokyoBounds,'tokyo');
    }
    function synchronizeSelection() {
      host.dataset.selectedArea=selected||'';host.dataset.selectedActivity=state.selectedActivity||'';host.dataset.selectedPlace=state.selectedPlace||'';
      chooser.value=selected||'';$('map-open-region').disabled=!selected;
      regionNodes.forEach(node=>{const active=node.id===selected;node.el.classList.toggle('active',active);node.el.setAttribute('aria-pressed',String(active));});
      placeNodes.forEach(node=>{const active=node.id===state.selectedPlace;node.el.classList.toggle('active',active);node.el.setAttribute('aria-pressed',String(active));});
      travelLayer.setStyle(zoneStyle);
      document.querySelectorAll('.area-tile').forEach(tile=>tile.classList.toggle('active',tile.dataset.area===selected));syncSaveButtons();
    }
    function keepPointVisible(lat,lon) {
      const frame=visibleFrame(),point=map.latLngToContainerPoint([lat,lon]);
      if(point.x<frame.left+28||point.x>frame.right-28||point.y<frame.top+32||point.y>frame.bottom-32||blocksControl({left:point.x-24,right:point.x+24,top:point.y-24,bottom:point.y+24})){
        const target=L.point((frame.left+frame.right)/2,(frame.top+frame.bottom)/2);camera(()=>map.panBy(point.subtract(target),{animate:false}));
      }
    }
    function selectArea(id,options={}) {
      const area=areaLookup.get(id),changed=selected!==(area?.id||null)||!!state.selectedActivity;
      sheetApi.remember();selected=area?.id||null;state.selected=selected;state.selectedActivity=null;state.selectedPlace=null;
      if(options.initialPage!==undefined||changed)state.selectedPage=options.initialPage;
      renderSelectedRegion(area);synchronizeSelection();
      if(options.reveal!==false){$('area-search').blur();sheetApi.set('peek',{mode:area?'region':'directory',remember:false});}
      else sheetApi.set(sheetApi.snap,{mode:area?'region':'directory',remember:false});
      if(options.bringIntoView!==false&&area&&ready){
        fit(zoneLayers.get(area.id).getBounds(),'custom',15.25);
        if(map.getZoom()<13.5){const feature=zoneLookup.get(area.id);camera(()=>map.setView([feature.properties.labelLat,feature.properties.labelLon],13.75,{animate:false}));keepPointVisible(feature.properties.labelLat,feature.properties.labelLon);}
      }
      positionLabels();
    }
    function selectActivity(id,options={}) {
      const item=activityLookup.get(id),place=placeLookup.get(id);if(!item||!place)return;
      sheetApi.remember();selected=item.area.id;state.selected=selected;state.selectedActivity=id;state.selectedPlace=place.id;state.selectedPage=item.index;
      state.lastActivities.set(selected,item.index);renderSelectedPlace(item.area,item.activity,place);synchronizeSelection();
      if(options.reveal!==false){$('area-search').blur();sheetApi.set('peek',{mode:'place',remember:false});}
      else sheetApi.set(sheetApi.snap,{mode:'place',remember:false});
      if(options.bringIntoView!==false&&ready){
        if(map.getZoom()<13.5)camera(()=>map.setView([place.lat,place.lon],14.5,{animate:false}));
        keepPointVisible(place.lat,place.lon);setViewState('custom');
      }
      positionLabels();
    }
    let previousRegions=null,regionLayoutKey='',regionLayout=null,labelFrame=0;
    function positionRegionNames(frame,enabled) {
      const visible=enabled&&sheetApi.snap!=='full'&&frame.bottom-frame.top>=45&&tokyoBounds.intersects(map.getBounds());
      regionHost.hidden=!visible;
      regionNodes.forEach(node=>{node.el.hidden=!visible;});
      if(!visible){host.dataset.regionLayout='hidden';host.dataset.regionEligible='0';return [];}
      const obstacles=controlsBounds?[controlsBounds]:[];
      if(airport&&map.getZoom()>=airport.minZoom){
        const point=map.latLngToContainerPoint([airport.lat,airport.lon]);
        if(point.x>frame.left&&point.x<frame.right&&point.y>frame.top&&point.y<frame.bottom)obstacles.push({left:point.x-65,right:point.x+65,top:point.y-32,bottom:point.y+17});
      }
      const items=regionNodes.map(node=>{
        const point=map.latLngToContainerPoint([node.lat,node.lon]);node.x=point.x;node.y=point.y;
        const fontSize=width<=700?12:12.5,rawWidth=Array.from(node.text).reduce((sum,char)=>sum+(/[\u3130-\u318f\uac00-\ud7a3]/.test(char)?fontSize:fontSize*.6),0);
        const w=node.label.offsetWidth||Math.ceil(rawWidth),h=node.label.offsetHeight||Math.ceil(fontSize*1.25);
        return {id:node.id,x:point.x,y:point.y,width:w,height:h};
      });
      const key=JSON.stringify({frame,obstacles,items:items.map(item=>[item.id,Math.round(item.x*4),Math.round(item.y*4),item.width,item.height])});
      if(key!==regionLayoutKey){regionLayout=layoutRegionLabels(items,frame,{obstacles,previous:previousRegions,gap:4});regionLayoutKey=key;previousRegions=regionLayout;}
      const result=regionLayout,reading=!result.fits;
      host.dataset.regionLayout=result.mode;host.dataset.regionLayoutFits=String(result.fits);host.dataset.regionEligible=String(items.length);
      regionHost.classList.toggle('is-reading',reading);regionHost.setAttribute('aria-label',reading?'도쿄 지역 이름 전체. 위아래로 스크롤해서 볼 수 있습니다.':'도쿄의 모든 지역 이름');
      for(const [key,value] of Object.entries({left:frame.left,top:frame.top,width:frame.right-frame.left,height:frame.bottom-frame.top}))regionHost.dataset['frame'+key[0].toUpperCase()+key.slice(1)]=value.toFixed(2);
      if(reading){
        // Leave Leaflet's touch-action:none ancestor only for the explicit
        // small-viewport reading fallback, enabling native list scrolling.
        if(regionHost.parentElement!==$('app-main'))$('app-main').appendChild(regionHost);
        regionHost.style.cssText='left:'+frame.left+'px;top:'+frame.top+'px;right:auto;bottom:auto;width:'+(frame.right-frame.left)+'px;height:'+(frame.bottom-frame.top)+'px';
        regionCanvas.style.cssText='width:'+result.contentWidth+'px;height:'+result.contentHeight+'px';regionHost.tabIndex=0;
      }else{
        if(regionHost.parentElement!==labels)labels.appendChild(regionHost);
        regionHost.style.cssText='';regionCanvas.style.cssText='';regionHost.removeAttribute('tabindex');regionHost.scrollTop=0;
      }
      const byId=new Map(result.items.map(item=>[item.id,item]));
      for(const node of regionNodes){
        const item=byId.get(node.id);node.placement=item;
        const rect=item.rect,origin=reading?(result.contentFrame||frame):{left:0,top:0};
        node.el.style.left=(item.x-origin.left)+'px';node.el.style.top=(item.y-origin.top)+'px';
        node.el.dataset.calloutLeft=rect.left.toFixed(2);node.el.dataset.calloutTop=rect.top.toFixed(2);node.el.dataset.calloutWidth=(rect.right-rect.left).toFixed(2);node.el.dataset.calloutHeight=(rect.bottom-rect.top).toFixed(2);
        node.el.dataset.anchorX=node.x.toFixed(2);node.el.dataset.anchorY=node.y.toFixed(2);
        const outside=node.x<frame.left+5||node.x>frame.right-5||node.y<frame.top+5||node.y>frame.bottom-5;
        node.el.dataset.offscreen=String(outside);node.el.title=node.area.name+' · 즐길 거리 '+node.area.activities.length+'개';
      }
      return reading?[frame]:result.items.map(item=>item.rect);
    }
    function positionLabels() {
      if(!ready)return;
      controlsBounds=controlBox();
      const zoom=map.getZoom(),frame=visibleFrame(),small=width<600,placed=[],visible=[];
      // A half-level dead band avoids flashing layers during a pinch gesture.
      if(regionMode==='regions'&&zoom>=13.5)regionMode='places';
      else if(regionMode==='places'&&zoom<=13)regionMode='regions';
      const showZones=regionMode==='regions';
      if(showZones&&!map.hasLayer(travelLayer))travelLayer.addTo(map);
      else if(!showZones&&map.hasLayer(travelLayer))map.removeLayer(travelLayer);
      zonePane.style.pointerEvents=showZones?'auto':'none';
      host.dataset.regionMode=regionMode;host.dataset.zoom=zoom.toFixed(3);host.dataset.centerLat=map.getCenter().lat.toFixed(6);host.dataset.centerLon=map.getCenter().lng.toFixed(6);host.classList.toggle('is-compact',small);
      host.dataset.visibleRegionZones=showZones?String(zones.features.length):'0';
      placed.push(...positionRegionNames(frame,showZones));
      const regionNames=regionNodes.filter(node=>!node.el.hidden).length;
      for(const node of [...placeNodes,...poiNodes]){
        const point=map.latLngToContainerPoint([node.lat,node.lon]);node.x=point.x;node.y=point.y;
        const suppressed=node.kind==='place'?regionMode!=='places':zoom<node.poi.minZoom||(node.kind==='station'&&regionMode!=='places');
        node.el.hidden=suppressed||frame.bottom-frame.top<40||point.x<15||point.x>width-15||point.y<frame.top+13||point.y>frame.bottom-13||blocksControl({left:point.x-15,right:point.x+15,top:point.y-15,bottom:point.y+15});
        node.el.classList.remove('name-visible');node.el.style.left=point.x+'px';node.el.style.top=point.y+'px';if(!node.el.hidden)visible.push(node);
      }
      const rank=node=>node.kind==='airport'?-60:node.kind==='place'?(node.id===state.selectedPlace?-120:node.place.areaId===selected?-20:8):16;
      const budget=small?(zoom<14.5?12:zoom<15.5?18:26):40;
      let names=0,poiNames=0;
      for(const node of visible.slice().sort((a,b)=>rank(a)-rank(b))){
        if(names>=budget)break;
        const labelWidth=node.name.offsetWidth||node.text.length*10+12,labelHeight=node.name.offsetHeight||21,half=labelWidth/2,pad=node.kind==='place'?29:20;
        const candidates=[[0,-pad],[half+18,0],[-half-18,0],[0,pad],[half+14,-29],[-half-14,-29]];let chosen=null;
        for(const offset of candidates){
          const x=node.x+offset[0],y=node.y+offset[1],rect={left:x-half,right:x+half,top:y-labelHeight/2,bottom:y+labelHeight/2};
          if(rect.left<5||rect.right>width-5||rect.top<frame.top||rect.bottom>frame.bottom||blocksControl(rect)||placed.some(other=>overlaps(rect,other)))continue;
          if(visible.some(other=>other!==node&&Math.hypot(other.x-node.x,other.y-node.y)>12&&overlaps(rect,{left:other.x-10,right:other.x+10,top:other.y-10,bottom:other.y+10},2)))continue;
          chosen={x,y,rect};break;
        }
        if(!chosen)continue;
        node.name.style.left=(node.size/2+chosen.x-node.x)+'px';node.name.style.top=(node.size/2+chosen.y-node.y)+'px';node.el.classList.add('name-visible');placed.push(chosen.rect);names++;if(node.kind!=='place')poiNames++;
      }
      host.dataset.visibleAreas=String(regionNames);host.dataset.visiblePlaces=String(visible.filter(node=>node.kind==='place').length);host.dataset.visiblePois=String(visible.filter(node=>node.kind!=='place').length);host.dataset.visibleNames=String(names+regionNames);host.dataset.visiblePoiNames=String(poiNames);
      $('map-help').textContent=regionMode==='regions'?(host.dataset.regionLayout==='reading'?'지역 이름 '+regionNames+'개 · 위아래로 넘겨보세요':regionNames?'지역 '+regionNames+'개 모두 표시 · 이름을 누르면 확대':'도쿄 버튼을 누르면 모든 지역이 보여요'):'핀을 누르면 사진과 설명 · 초록: 지하철역';
      $('zoom-in').disabled=zoom>=18;$('zoom-out').disabled=zoom<=3;
    }
    chooser.innerHTML='<option value="">이름으로 찾기</option>'+state.areas.map(area=>'<option value="'+esc(area.id)+'">'+esc(area.name)+' · '+area.activities.length+'개</option>').join('');chooser.addEventListener('change',()=>selectArea(chooser.value));
    $('clear-map-selection').addEventListener('click',()=>selectArea(null,{reveal:false,bringIntoView:false}));
    $('map-open-region').addEventListener('click',()=>{if(selected)openArea(selected,$('map-open-region'),state.selectedPage);});
    function scheduleLabels(){if(!labelFrame)labelFrame=requestAnimationFrame(()=>{labelFrame=0;positionLabels();});}
    function flushLabels(){if(labelFrame)cancelAnimationFrame(labelFrame);labelFrame=0;positionLabels();}
    map.on('movestart zoomstart',()=>{if(!programmatic){sheetApi.minimizeForMap();setViewState('custom');}});map.on('move zoom',scheduleLabels);map.on('moveend zoomend',flushLabels);
    function changeZoom(delta){
      sheetApi.minimizeForMap();const frame=visibleFrame();camera(()=>map.setZoomAround(L.point((frame.left+frame.right)/2,(frame.top+frame.bottom)/2),Math.max(3,Math.min(18,map.getZoom()+delta)),{animate:false}));setViewState('custom');positionLabels();
    }
    $('zoom-in').addEventListener('click',()=>changeZoom(.75));$('zoom-out').addEventListener('click',()=>changeZoom(-.75));$('reset-map').addEventListener('click',()=>showView('tokyo'));
    for(const view of ['tokyo','japan','narita'])$(view+'-view').addEventListener('click',()=>showView(view));
    host.dataset.basemap='loading';
    const basemap=createTokyoBasemap(map,{minZoom:3,maxZoom:18,
      onTileSuccess(){successes++;host.dataset.basemap=failures?'partial':'ready';if(!failures)$('map-status').hidden=true;scheduleLabels();},
      onTileFailure(){failures++;host.dataset.basemap=successes?'partial':'fallback';$('map-status').hidden=false;$('retry-map-tiles').hidden=false;$('map-status-text').textContent=successes?'일부 배경 지도를 불러오지 못했어요.':'배경 지도 연결이 어려워요. 간략한 윤곽을 표시합니다.';scheduleLabels();}
    });
    basemap.on('loading',()=>{failures=0;});$('retry-map-tiles').addEventListener('click',()=>{failures=0;$('map-status-text').textContent='배경 지도를 다시 불러오는 중이에요.';$('retry-map-tiles').hidden=true;basemap.redraw();});
    function draw(){
      if(!host.clientWidth||!host.clientHeight)return;width=host.clientWidth;height=host.clientHeight;
      if(!ready){ready=true;fit(tokyoBounds,'tokyo');$('map-loading').hidden=true;}else camera(()=>map.invalidateSize({animate:false,pan:true}));positionLabels();
    }
    new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(draw,70);}).observe(host);draw();
    return {select:selectArea,selectActivity,refresh:draw,refreshLabels:positionLabels};
  }

  async function init(){
    sheetApi=createSheet();
    const initiallySaved=location.hash==='#saved';
    if(location.hash!=='#map')history.replaceState(null,'','#map');
    try{
      const results=await Promise.all([fetch('assets/areas.json?v=app-10'),fetch('assets/japan-outline.geojson'),fetch('assets/poi-candidates.json?v=app-10'),fetch('assets/travel-zones.geojson?v=app-10'),fetch('assets/activity-places.json?v=app-10')]);
      if(results.some(r=>!r.ok))throw new Error('content_load_failed');
      const [data,geometry,poiData,zones,placeData]=await Promise.all(results.map(r=>r.json()));
      const pois=Array.isArray(poiData)?poiData:poiData.points;
      state.areas=data.areas;
      if(!state.areas.length||state.areas.some(a=>!a.activities.length||a.activities.some(t=>!photosFor(t).length)))throw new Error('invalid_content');
      const activityOwners=new Map(state.areas.flatMap(area=>area.activities.map(activity=>[activity.id,area.id])));
      const mapped=placeData.places.flatMap(place=>place.activityIds),zoneIds=new Set(zones.features.map(feature=>feature.properties.areaId));
      if(mapped.length!==activityOwners.size||new Set(mapped).size!==mapped.length||placeData.places.some(place=>!Number.isFinite(place.lat)||!Number.isFinite(place.lon)||!place.activityIds.length||place.activityIds.some(id=>activityOwners.get(id)!==place.areaId))||zoneIds.size!==state.areas.length||state.areas.some(area=>!zoneIds.has(area.id)))throw new Error('invalid_map_content');
      readSaved();makeDirectory();makeSources();
      await document.fonts.ready;
      sheetApi.refresh();mapApi=buildMap(geometry,pois,zones,placeData.places);sheetApi.refresh();
      if(initiallySaved)showSaved();
      document.body.dataset.ready='true';
    }catch(error){
      $('map-loading').textContent='지도를 불러오지 못했습니다.';$('app-error').hidden=false;
      document.body.dataset.ready='error';console.error('Tokyo guide could not load:',error);
    }
  }
  init();
})();
