const samples = {
  "ミュウex SAR": {sale:"10,800円", buy:"8,000円"},
  "ミュウ": {sale:"10,000円", buy:"7,500円"},
  "リザードンex SAR": {sale:"7,980円", buy:"5,800円"},
  "ピカチュウ": {sale:"12,800円", buy:"9,000円"}
};

const nameInput = document.getElementById("cardName");
const result = document.getElementById("result");

function searchCard(){
  const raw = nameInput.value.trim();
  if(!raw){ nameInput.focus(); return; }
  const key = Object.keys(samples).find(k => raw.includes(k) || k.includes(raw));
  const data = samples[key] || {sale:"—", buy:"—"};
  document.getElementById("resultName").textContent = raw;
  document.getElementById("salePrice").textContent = data.sale;
  document.getElementById("buyPrice").textContent = data.buy;
  document.getElementById("trend").textContent = key ? "参考価格" : "データ準備中";
  result.classList.remove("hidden");
}
document.getElementById("searchBtn").addEventListener("click", searchCard);
nameInput.addEventListener("keydown", e => { if(e.key === "Enter") searchCard(); });
