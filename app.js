const API="https://api.tcgdex.net/v2/ja";
let sets=[], currentCards=[], selectedSet=null;

const setSearch=document.getElementById("setSearch");
const setSelect=document.getElementById("setSelect");
const setInfo=document.getElementById("setInfo");
const cardSearch=document.getElementById("cardSearch");
const results=document.getElementById("results");
const statusEl=document.getElementById("status");

function textName(v){ return typeof v==="string" ? v : (v?.ja || v?.en || ""); }
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
    o.value=s.id;o.textContent=`${setName(s)}（${s.cardCount?.total||"?"}枚）`;
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
  if(!id){selectedSet=null;currentCards=[];setInfo.classList.add("hidden");results.innerHTML="";return;}
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
  setInfo.innerHTML=(logo?`<img src="${logo}" alt="">`:"")+`<div><b>${textName(s.name)}</b><span>${s.releaseDate||""}　${s.cardCount?.total||currentCards.length}枚</span></div>`;
  setInfo.classList.remove("hidden");
}

function renderCards(cards){
  if(!cards.length){results.innerHTML='<div class="empty">このパック内に一致するカードがありません。</div>';return;}
  results.innerHTML=cards.map(c=>{
    const image=c.image ? c.image+".png" : "";
    return `<article class="item">
      ${image?`<img class="thumb" src="${image}" alt="${esc(c.name)}" loading="lazy">`:`<div class="thumb"></div>`}
      <div class="item-main">
        <div class="head"><strong>${esc(c.name)}</strong>${c.rarity?`<span class="rarity">${esc(c.rarity)}</span>`:""}</div>
        <div class="meta">カード番号：${esc(c.localId||"—")}</div>
        <div class="prices"><div class="price"><span>販売価格</span><b>—</b></div><div class="price"><span>買取価格</span><b>—</b></div></div>
        <p class="notice">カード画像・カード情報はTCGdexから取得。価格連携は次の段階で追加します。</p>
      </div>
    </article>`;
  }).join("");
}

function searchCards(){
  const q=cardSearch.value.trim().toLowerCase();
  const filtered=q?currentCards.filter(c=>textName(c.name).toLowerCase().includes(q)):currentCards;
  statusEl.textContent=`${filtered.length}件`;
  renderCards(filtered.slice(0,60));
}
document.getElementById("searchBtn").addEventListener("click",searchCards);
cardSearch.addEventListener("keydown",e=>{if(e.key==="Enter")searchCards()});
function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}

loadSets();
