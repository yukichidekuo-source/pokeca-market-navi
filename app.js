const API="https://api.tcgdex.net/v2/ja";
let sets=[], currentCards=[], selectedSet=null, detailCache=new Map();

const setSearch=document.getElementById("setSearch");
const setSelect=document.getElementById("setSelect");
const setInfo=document.getElementById("setInfo");
const cardSearch=document.getElementById("cardSearch");
const results=document.getElementById("results");
const statusEl=document.getElementById("status");

function textName(v){
  if(typeof v==="string") return v;
  if(v && typeof v==="object") return v.ja || v.en || v.name || "";
  return "";
}
function setName(s){ return textName(s.name); }

async function loadSets(){
  try{
    const res=await fetch(`${API}/sets`);
    if(!res.ok) throw new Error("sets");
    sets=await res.json();
    renderSetOptions(sets);
    statusEl.textContent=`${sets.length}個のパック・セットを読み込みました`;
  }catch(e){
    statusEl.textContent="パック情報を読み込めませんでした。時間を置いて再読み込みしてください。";
    setSelect.innerHTML='<option value="">読み込み失敗</option>';
  }
}

function renderSetOptions(list){
  setSelect.innerHTML='<option value="">パックを選択してください</option>';
  list.forEach(s=>{
    const o=document.createElement("option");
    o.value=s.id;
    o.textContent=`${setName(s)}（${s.cardCount?.total||"?"}枚）`;
    setSelect.appendChild(o);
  });
}

setSearch.addEventListener("input",()=>{
  const q=setSearch.value.trim().toLowerCase();
  const filtered=q?sets.filter(s=>setName(s).toLowerCase().includes(q)):sets;
  renderSetOptions(filtered.slice(0,150));
});

setSelect.addEventListener("change",async()=>{
  const id=setSelect.value;
  cardSearch.value="";
  detailCache.clear();
  if(!id){
    selectedSet=null;
    currentCards=[];
    setInfo.classList.add("hidden");
    results.innerHTML="";
    statusEl.textContent="パックを選択してください";
    return;
  }
  selectedSet=sets.find(s=>s.id===id);
  await loadSet(id);
});

async function loadSet(id){
  statusEl.textContent="カード一覧を読み込んでいます…";
  results.innerHTML="";
  try{
    const res=await fetch(`${API}/sets/${encodeURIComponent(id)}`);
    if(!res.ok) throw new Error("set");
    const data=await res.json();
    currentCards=data.cards||[];
    showSetInfo(data);
    statusEl.textContent=`${textName(data.name)}：${currentCards.length}枚`;
    await renderCards(currentCards.slice(0,40));
  }catch(e){
    statusEl.textContent="このパックの読み込みに失敗しました。";
  }
}

function normalizeImageUrl(image, quality="high"){
  if(!image) return "";
  const url=String(image).replace(/\/+$/,"");
  if(/\.(webp|png|jpg|jpeg)(\?.*)?$/i.test(url)) return url;
  return `${url}/${quality}.webp`;
}

function showSetInfo(s){
  const logo=normalizeImageUrl(s.logo,"low");
  setInfo.innerHTML=(logo?`<img src="${esc(logo)}" alt="" onerror="this.style.display='none'">`:"")+
    `<div><b>${esc(textName(s.name))}</b><span>${esc(s.releaseDate||"")}　${s.cardCount?.total||currentCards.length}枚</span></div>`;
  setInfo.classList.remove("hidden");
}

async function getCardDetail(c){
  if(c.image && c.rarity) return c;
  const key=`${selectedSet?.id||""}/${c.localId||c.id||""}`;
  if(detailCache.has(key)) return detailCache.get(key);

  let url="";
  if(selectedSet?.id && c.localId!=null){
    url=`${API}/sets/${encodeURIComponent(selectedSet.id)}/${encodeURIComponent(c.localId)}`;
  }else if(c.id){
    url=`${API}/cards/${encodeURIComponent(c.id)}`;
  }else{
    return c;
  }

  try{
    const res=await fetch(url);
    if(res.ok){
      const detail=await res.json();
      const merged={...c,...detail};
      detailCache.set(key,merged);
      return merged;
    }
  }catch(e){}
  detailCache.set(key,c);
  return c;
}

async function getCardDetails(cards){
  // 検索対象のカードは個別APIから補完。
  // セット一覧のbriefに画像が無くても、ここで画像・日本語名を取得する。
  return Promise.all(cards.map(getCardDetail));
}

function cardMatches(c,q){
  const needle=q.toLowerCase();
  const name=textName(c.name).toLowerCase();
  const id=String(c.localId||"").toLowerCase();
  return name.includes(needle) || id.includes(needle);
}

async function renderCards(cards){
  if(!cards.length){
    results.innerHTML='<div class="empty">このパック内に一致するカードがありません。</div>';
    return;
  }

  results.innerHTML=cards.map(c=>{
    const name=textName(c.name);
    return `<article class="item">
      <div class="thumb image-loading">読み込み中</div>
      <div class="item-main">
        <div class="head"><strong>${esc(name)}</strong>${c.rarity?`<span class="rarity">${esc(c.rarity)}</span>`:""}</div>
        <div class="meta">カード番号：${esc(c.localId||"—")}</div>
        <div class="prices"><div class="price"><span>販売価格</span><b>—</b></div><div class="price"><span>買取価格</span><b>—</b></div></div>
        <p class="notice">カード画像・カード情報はTCGdexから取得。価格連携は次の段階で追加します。</p>
      </div>
    </article>`;
  }).join("");

  const details=await getCardDetails(cards);

  results.innerHTML=details.map(c=>{
    const image=normalizeImageUrl(c.image,"high");
    const name=textName(c.name);
    const img=image
      ? `<img class="thumb" src="${esc(image)}" alt="${esc(name)}" loading="lazy"
           onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src=this.src.replace(/\/high\.webp$/,'/high.png')}else if(!this.dataset.fallback2){this.dataset.fallback2=1;this.src=this.src.replace(/\/high\.png$/,'/low.webp')}else{this.style.display='none'}">`
      : '<div class="thumb"></div>';

    return `<article class="item">
      ${img}
      <div class="item-main">
        <div class="head"><strong>${esc(name)}</strong>${c.rarity?`<span class="rarity">${esc(c.rarity)}</span>`:""}</div>
        <div class="meta">カード番号：${esc(c.localId||"—")}</div>
        <div class="prices"><div class="price"><span>販売価格</span><b>—</b></div><div class="price"><span>買取価格</span><b>—</b></div></div>
        <p class="notice">カード画像・カード情報はTCGdexから取得。価格連携は次の段階で追加します。</p>
      </div>
    </article>`;
  }).join("");
}

async function searchCards(){
  const q=cardSearch.value.trim();

  if(!q){
    statusEl.textContent=`${currentCards.length}件`;
    await renderCards(currentCards.slice(0,60));
    return;
  }

  statusEl.textContent="カードを検索しています…";

  // まずセット内カードの詳細情報を取得してから検索する。
  // これにより「25th」など、brief側の名前が検索に使えないケースにも対応。
  const details=await getCardDetails(currentCards);

  let filtered=details.filter(c=>cardMatches(c,q));

  // セット内で見つからなかった場合のみ、TCGdex全体検索を補完的に利用。
  if(!filtered.length){
    try{
      const url=`${API}/cards?name=${encodeURIComponent(q)}`;
      const res=await fetch(url);
      if(res.ok){
        const all=await res.json();
        if(Array.isArray(all)){
          const ids=new Set(currentCards.map(c=>c.id));
          filtered=all.filter(c=>ids.has(c.id));
          if(filtered.length) filtered=await getCardDetails(filtered);
        }
      }
    }catch(e){}
  }

  statusEl.textContent=`${filtered.length}件`;
  await renderCards(filtered.slice(0,60));
}

document.getElementById("searchBtn").addEventListener("click",searchCards);
cardSearch.addEventListener("keydown",e=>{if(e.key==="Enter")searchCards()});

function esc(s){
  return String(s??"").replace(/[&<>"']/g,m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}

loadSets();
