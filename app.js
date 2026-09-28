const API="https://api.tcgdex.net/v2/ja";
const API_EN="https://api.tcgdex.net/v2/en";
let sets=[], currentCards=[], selectedSet=null;
let detailCache=new Map();
let searchToken=0;

const setSearch=document.getElementById("setSearch");
const setSelect=document.getElementById("setSelect");
const setInfo=document.getElementById("setInfo");
const cardSearch=document.getElementById("cardSearch");
const raritySelect=document.getElementById("raritySelect");
const results=document.getElementById("results");
const statusEl=document.getElementById("status");
const resultCount=document.getElementById("resultCount");

function textName(v){
  if(typeof v==="string") return v;
  if(v && typeof v==="object") return v.ja || v.en || v.name || "";
  return "";
}
function setName(s){ return textName(s.name); }
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}

function imageCandidates(image){
  if(!image) return [];
  const base=String(image).replace(/\/+$/,'').replace(/\.(webp|png|jpg|jpeg)$/i,'');
  const langs=[base];
  if(base.includes('/ja/')) langs.push(base.replace('/ja/','/en/'));
  if(base.includes('/en/')) langs.push(base.replace('/en/','/ja/'));
  const out=[];
  for(const b of langs){
    out.push(`${b}/high.webp`,`${b}/high.png`,`${b}/low.webp`,`${b}/low.png`);
  }
  return [...new Set(out)];
}
function directImage(image){ return imageCandidates(image)[0] || ""; }

function setImageWithFallback(el, candidates){
  if(!candidates.length){
    el.className="thumb image-error";
    el.textContent="画像なし";
    return;
  }
  let i=0;
  const next=()=>{
    if(i>=candidates.length){
      el.className="thumb image-error";
      el.textContent="画像なし";
      return;
    }
    el.src=candidates[i++];
  };
  el.onerror=next;
  next();
}

async function loadSets(){
  try{
    const res=await fetch(`${API}/sets`);
    if(!res.ok) throw new Error("sets");
    const rawSets=await res.json();
    sets=uniqueSets(Array.isArray(rawSets)?rawSets:[]);
    renderSetOptions(sets);
    await loadRarities();
    statusEl.textContent=`${sets.length}個のパック・セットを読み込みました`;
  }catch(e){
    statusEl.textContent="パック情報を読み込めませんでした。時間を置いて再読み込みしてください。";
    setSelect.innerHTML='<option value="">読み込み失敗</option>';
  }
}

function setKey(s){
  const name=setName(s).trim().toLowerCase().replace(/\s+/g," ");
  const date=String(s.releaseDate||"").trim();
  const total=String(s.cardCount?.total||"").trim();
  return `${name}|${date}|${total}`;
}

function uniqueSets(list){
  const seenId=new Set();
  const seenFallback=new Set();
  const out=[];
  for(const s of list){
    const id=String(s.id||'').trim();
    if(id){
      if(seenId.has(id)) continue;
      seenId.add(id);
    }
    const key=setKey(s);
    if(!id && seenFallback.has(key)) continue;
    if(!id) seenFallback.add(key);
    out.push(s);
  }
  return out;
}

function renderSetOptions(list){
  setSelect.innerHTML='<option value="">パックを選択してください</option>';
  uniqueSets(list).forEach(s=>{
    const o=document.createElement("option");
    o.value=s.id;
    o.textContent=`${setName(s)}（${s.cardCount?.total||"?"}枚）`;
    setSelect.appendChild(o);
  });
}

async function loadRarities(){
  try{
    const res=await fetch(`${API}/rarities`);
    if(!res.ok) throw new Error("rarities");
    const data=await res.json();
    const list=Array.isArray(data)?data:[];
    raritySelect.innerHTML='<option value="">すべてのレアリティ</option>';
    list.forEach(r=>{
      const value=typeof r==="string"?r:(r?.name||r?.ja||r?.en||"");
      if(!value) return;
      const o=document.createElement("option");
      o.value=value;o.textContent=value;
      raritySelect.appendChild(o);
    });
  }catch(e){
    // APIにレアリティ一覧が無い場合も、カード側の値から動的に作る。
    raritySelect.innerHTML='<option value="">すべてのレアリティ</option>';
  }
}

setSearch.addEventListener("input",()=>{
  const q=setSearch.value.trim().toLowerCase();
  const filtered=q?sets.filter(s=>setName(s).toLowerCase().includes(q)):sets;
  renderSetOptions(filtered.slice(0,200));
});

setSelect.addEventListener("change",async()=>{
  const id=setSelect.value;
  cardSearch.value="";
  raritySelect.value="";
  detailCache.clear();
  if(!id){
    selectedSet=null;currentCards=[];setInfo.classList.add("hidden");results.innerHTML="";resultCount.textContent="";
    statusEl.textContent="パックを選択してください";
    return;
  }
  selectedSet=sets.find(s=>s.id===id);
  await loadSet(id);
});

async function loadSet(id){
  const token=++searchToken;
  statusEl.textContent="カード一覧を読み込んでいます…";
  results.innerHTML="";resultCount.textContent="";
  try{
    const data=await fetchJson(`${API}/sets/${encodeURIComponent(id)}`);
    let cards=Array.isArray(data.cards)?data.cards:[];
    const expected=Number(data.cardCount?.total||selectedSet?.cardCount?.total||0);

    // TCGdexではセット詳細の cards が言語やセットによって不完全になる場合があるため、
    // 「cards配列」だけを正解にせず、カード一覧APIを set.id で取得して補完する。
    if(cards.length < expected){
      const bySet=await fetchCardsBySet(id, API);
      cards=mergeCards(cards,bySet);
    }
    if(cards.length < expected){
      const bySetEn=await fetchCardsBySet(id, API_EN);
      cards=mergeCards(cards,bySetEn);
    }

    // それでも足りない場合は、取得できたlocalIdを基準に詳細APIで補完。
    // 数字だけでなく TG01 / GG01 / SV... などの英数字localIdも扱う。
    if(cards.length < expected){
      const recovered=await recoverCardsByKnownIds(id,cards);
      cards=mergeCards(cards,recovered);
    }

    currentCards=dedupeCards(cards).sort((a,b)=>compareLocalId(a.localId,b.localId));
    if(token!==searchToken) return;
    showSetInfo(data);
    await populateRaritiesFromCards();
    statusEl.textContent=`${textName(data.name)}：${currentCards.length}枚（全件表示）`;
    await applyFilters();
  }catch(e){
    console.error(e);
    statusEl.textContent="このパックの読み込みに失敗しました。時間を置いて再読み込みしてください。";
  }
}

async function fetchCardsBySet(setId, apiBase){
  const all=[];
  const seen=new Set();
  // TCGdexの一覧APIはページ指定時のデフォルトが100件なので、明示的にページングする。
  for(let page=1; page<=20; page++){
    const url=`${apiBase}/cards?set.id=${encodeURIComponent('eq:'+setId)}&pagination:page=${page}&pagination:itemsPerPage=100`;
    try{
      const data=await fetchJson(url);
      if(!Array.isArray(data) || !data.length) break;
      for(const c of data){
        const key=String(c.id||`${c.localId||''}|${textName(c.name)}`).toLowerCase();
        if(!seen.has(key)){seen.add(key);all.push(c);}
      }
      if(data.length<100) break;
    }catch(e){
      break;
    }
  }
  return all;
}

function mergeCards(a,b){
  const map=new Map();
  [...(a||[]),...(b||[])].forEach(c=>{
    if(!c) return;
    const key=String(c.id||`${c.localId||''}|${textName(c.name)}`).toLowerCase();
    const old=map.get(key);
    map.set(key,old?{...old,...c}:c);
  });
  return [...map.values()];
}

async function recoverCardsByKnownIds(setId, cards){
  const ids=[...new Set((cards||[]).map(c=>String(c.localId||'')).filter(Boolean))];
  if(!ids.length) return [];
  return dedupeCards(await mapLimit(ids,8,async localId=>{
    const urls=[
      `${API}/sets/${encodeURIComponent(setId)}/${encodeURIComponent(localId)}`,
      `${API_EN}/sets/${encodeURIComponent(setId)}/${encodeURIComponent(localId)}`
    ];
    for(const url of urls){
      try{
        const card=await fetchJson(url);
        if(card && card.id) return card;
      }catch(e){}
    }
    return null;
  }).then(cards=>cards.filter(Boolean)));
}

function dedupeCards(cards){
  const seen=new Set();
  return cards.filter(c=>{
    const key=String(c.id||`${c.localId||''}|${textName(c.name)}`).toLowerCase();
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function recoverCardsByLocalId(setId,total){
  // 旧版互換用。v10ではfetchCardsBySetを優先する。
  const ids=[];
  const max=Math.max(Number(total)||0,1)+20;
  for(let n=1;n<=max;n++){ ids.push(String(n)); ids.push(String(n).padStart(3,'0')); }
  return dedupeCards(await mapLimit([...new Set(ids)],8,async localId=>{
    for(const apiBase of [API,API_EN]){
      try{
        const card=await fetchJson(`${apiBase}/sets/${encodeURIComponent(setId)}/${encodeURIComponent(localId)}`);
        if(card?.id) return card;
      }catch(e){}
    }
    return null;
  }).then(x=>x.filter(Boolean)));
}

async function populateRaritiesFromCards(){
  const values=new Set();
  currentCards.forEach(c=>{if(c.rarity) values.add(String(c.rarity));});
  if(!values.size && currentCards.length){
    const sample=await getCardDetails(currentCards.slice(0,Math.min(currentCards.length,40)));
    sample.forEach(c=>{if(c.rarity) values.add(String(c.rarity));});
  }
  if(!values.size) return;
  const current=raritySelect.value;
  raritySelect.innerHTML='<option value="">すべてのレアリティ</option>';
  [...values].sort((a,b)=>a.localeCompare(b,'ja')).forEach(value=>{
    const o=document.createElement('option');
    o.value=value;o.textContent=value;raritySelect.appendChild(o);
  });
  if([...raritySelect.options].some(o=>o.value===current)) raritySelect.value=current;
}

function compareLocalId(a,b){
  const na=parseInt(String(a||"").match(/\d+/)?.[0]||"999999",10);
  const nb=parseInt(String(b||"").match(/\d+/)?.[0]||"999999",10);
  if(na!==nb) return na-nb;
  return String(a||"").localeCompare(String(b||""),"ja");
}

function showSetInfo(s){
  const logo=directImage(s.logo);
  setInfo.innerHTML=(logo?`<img src="${esc(logo)}" alt="" onerror="this.style.display='none'">`:"")+`<div><b>${esc(textName(s.name))}</b><span>${esc(s.releaseDate||"")}　${s.cardCount?.total||currentCards.length}枚</span></div>`;
  setInfo.classList.remove("hidden");
}

async function fetchJson(url){
  const res=await fetch(url);
  if(!res.ok) throw new Error(String(res.status));
  return await res.json();
}

async function getCardDetail(c){
  const key=c.id || `${selectedSet?.id||""}/${c.localId||""}`;
  if(detailCache.has(key)) return detailCache.get(key);

  const urls=[];
  if(c.id){
    urls.push(`${API}/cards/${encodeURIComponent(c.id)}`);
    urls.push(`${API_EN}/cards/${encodeURIComponent(c.id)}`);
  }
  if(selectedSet?.id && c.localId!=null){
    urls.push(`${API}/sets/${encodeURIComponent(selectedSet.id)}/${encodeURIComponent(c.localId)}`);
    urls.push(`${API_EN}/sets/${encodeURIComponent(selectedSet.id)}/${encodeURIComponent(c.localId)}`);
  }

  for(const url of urls){
    try{
      const detail=await fetchJson(url);
      const merged={...c,...detail};
      detailCache.set(key,merged);
      return merged;
    }catch(e){}
  }
  detailCache.set(key,c);
  return c;
}

async function mapLimit(items, limit, fn){
  const out=new Array(items.length);
  let cursor=0;
  async function worker(){
    while(true){
      const i=cursor++;
      if(i>=items.length) return;
      try{out[i]=await fn(items[i],i);}catch(e){out[i]=items[i];}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

async function getCardDetails(cards){
  return mapLimit(cards,8,getCardDetail);
}

function cardMatches(c,q){
  const needle=q.toLowerCase();
  const name=textName(c.name).toLowerCase();
  const id=String(c.localId||"").toLowerCase();
  return name.includes(needle)||id.includes(needle);
}

async function globalCardSearch(name, rarity){
  const params=[];
  if(name) params.push(`name=${encodeURIComponent(name)}`);
  if(rarity) params.push(`rarity=${encodeURIComponent(rarity)}`);
  const urls=[`${API}/cards?${params.join('&')}`];
  if(name && !/[\u3040-\u30ff\u3400-\u9fff]/.test(name)) urls.push(`${API_EN}/cards?${params.join('&')}`);
  for(const url of urls){
    try{
      const data=await fetchJson(url);
      if(Array.isArray(data)) return data;
    }catch(e){}
  }
  return [];
}

async function applyFilters(){
  const token=++searchToken;
  const q=cardSearch.value.trim();
  const rarity=raritySelect.value;
  let filtered=currentCards;

  if(!q && !rarity){
    resultCount.textContent=`${currentCards.length}枚`;
    statusEl.textContent=`${textName(selectedSet?.name||"")}：${currentCards.length}枚（全件表示）`;
    await renderCards(filtered);
    return;
  }

  statusEl.textContent="検索しています…";

  if(q){
    filtered=currentCards.filter(c=>cardMatches(c,q));
    if(!filtered.length){
      const all=await globalCardSearch(q,rarity);
      const ids=new Set(currentCards.map(c=>c.id));
      filtered=all.filter(c=>ids.has(c.id));
    }
    if(!filtered.length){
      // 日本語名の補完。セット内の詳細を取得して確実に検索する。
      const details=await getCardDetails(currentCards);
      filtered=details.filter(c=>cardMatches(c,q));
    }
  }

  if(rarity){
    // まず現在のカードに既にレアリティがある場合はローカルで絞る。
    const local=filtered.filter(c=>String(c.rarity||"")===rarity);
    if(local.length || filtered.length===0){
      filtered=local;
    }else{
      // briefにレアリティが無い場合はAPIで該当レアリティを取得してIDで交差。
      const all=await globalCardSearch(q,rarity);
      const ids=new Set(all.map(c=>c.id));
      filtered=filtered.filter(c=>ids.has(c.id));
      if(!filtered.length){
        const details=await getCardDetails(filtered.length?filtered:currentCards);
        filtered=details.filter(c=>cardMatches(c,q||"") && String(c.rarity||"")===rarity);
      }
    }
  }

  if(token!==searchToken) return;
  resultCount.textContent=`${filtered.length}枚`;
  statusEl.textContent=`${filtered.length}件`;
  await renderCards(filtered);
}

raritySelect.addEventListener("change",applyFilters);
document.getElementById("searchBtn").addEventListener("click",applyFilters);
cardSearch.addEventListener("keydown",e=>{if(e.key==="Enter")applyFilters()});
document.getElementById("clearBtn").addEventListener("click",async()=>{
  cardSearch.value="";raritySelect.value="";await applyFilters();
});

async function enrichMissingImages(cards){
  const missing=cards.filter(c=>!c.image && (c.id||c.localId!=null));
  if(!missing.length) return;
  const details=await getCardDetails(missing);
  details.forEach(c=>{
    const id=esc(c.id||`${selectedSet?.id||""}-${c.localId||""}`);
    const el=document.querySelector(`[data-card-id="${id}"]`);
    if(!el || !c.image) return;
    const holder=el.querySelector(".thumb-holder");
    if(holder){
      const img=document.createElement("img");
      img.className="thumb";img.alt=textName(c.name);img.loading="lazy";
      holder.replaceWith(img);
      setImageWithFallback(img,imageCandidates(c.image));
    }
  });
}

async function renderCards(cards){
  if(!cards.length){
    results.innerHTML='<div class="empty">この条件に一致するカードがありません。</div>';
    return;
  }

  // 全カードを表示。画像はlazy loadingなので枚数が多いパックでもスクロールできます。
  results.innerHTML=cards.map((c,idx)=>{
    const name=textName(c.name)||"カード";
    const key=esc(c.id||`${selectedSet?.id||""}-${c.localId||idx}`);
    const holder=c.image
      ? `<div class="thumb-holder"><img class="thumb" data-img-src="1" alt="${esc(name)}" loading="lazy"></div>`
      : `<div class="thumb-holder"><div class="thumb image-loading">画像確認中</div></div>`;
    return `<article class="item" data-card-id="${key}">
      ${holder}
      <div class="item-main">
        <div class="head"><strong>${esc(name)}</strong>${c.rarity?`<span class="rarity">${esc(c.rarity)}</span>`:""}</div>
        <div class="meta">カード番号：${esc(c.localId||"—")}</div>
        <div class="prices"><div class="price"><span>販売価格</span><b>—</b></div><div class="price"><span>買取価格</span><b>—</b></div></div>
        <p class="notice">カード画像・カード情報はTCGdexから取得。価格連携は次の段階で追加します。</p>
      </div>
    </article>`;
  }).join("");

  cards.forEach(c=>{
    const key=esc(c.id||`${selectedSet?.id||""}-${c.localId||""}`);
    const article=document.querySelector(`[data-card-id="${key}"]`);
    const img=article?.querySelector("img[data-img-src]");
    if(img) setImageWithFallback(img,imageCandidates(c.image));
  });

  // briefに画像が無いカードだけ詳細APIで補完。
  await enrichMissingImages(cards);
}

loadSets();
