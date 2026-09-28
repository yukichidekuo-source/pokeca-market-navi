const API="https://api.tcgdex.net/v2/ja";
let sets=[], currentCards=[], selectedSet=null;

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
    renderCards(currentCards.slice(0,40));
  }catch(e){
    statusEl.textContent="このパックの読み込みに失敗しました。";
  }
}

function showSetInfo(s){
  const logo=s.logo ? s.logo+".webp" : "";
  setInfo.innerHTML=(logo?'<img src="'+esc(logo)+'" alt="">':"")+
    `<div><b>${esc(textName(s.name))}</b><span>${esc(s.releaseDate||"")}　${s.cardCount?.total||currentCards.length}枚</span></div>`;
  setInfo.classList.remove("hidden");
}

function cardImage(c){
  if(!c.image) return "";
  // TCGdexのカード画像は image のベースURLに画質を付ける
  return c.image + "/high.webp";
}

function renderCards(cards){
  if(!cards.length){
    results.innerHTML='<div class="empty">このパック内に一致するカードがありません。</div>';
    return;
  }

  results.innerHTML=cards.map(c=>{
    const image=cardImage(c);
    const name=textName(c.name);
    const img=image
      ? `<img class="thumb" src="${esc(image)}" alt="${esc(name)}" loading="lazy"
           onerror="if(!this.dataset.fallback){this.dataset.fallback=1;this.src=this.src.replace(/\/high\.webp$/,'/high.png')}else{this.style.display='none'}">`
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
    renderCards(currentCards.slice(0,60));
    return;
  }

  const localQ=q.toLowerCase();
  let filtered=currentCards.filter(c=>{
    const name=textName(c.name).toLowerCase();
    const localId=String(c.localId||"").toLowerCase();
    return name.includes(localQ) || localId.includes(localQ);
  });

  // セット内の一覧データだけで名前が一致しない場合も、TCGdexのカード検索を補完的に試す
  if(!filtered.length){
    try{
      const url=`${API}/cards?name=${encodeURIComponent(q)}&pagination:itemsPerPage=60`;
      const res=await fetch(url);
      if(res.ok){
        const all=await res.json();
        if(Array.isArray(all)){
          const ids=new Set(currentCards.map(c=>c.id));
          filtered=all.filter(c=>ids.has(c.id));
        }
      }
    }catch(e){}
  }

  statusEl.textContent=`${filtered.length}件`;
  renderCards(filtered.slice(0,60));
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
