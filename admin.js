// salary-admin / admin.js
// Generated with Claude — review before deploy.
import { db } from "./firebase-config.js";
import {
  collection, onSnapshot, doc, setDoc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COL = "nodes";
const PASSWORD = "MWYXRddmFDA8";      // 12 символов
const AUTH_KEY = "salary_admin_auth";

let lang = "ru";
let nodes = [];                        // плоский список из Firestore
let view = { t: "home" };              // {t:'home'} | {t:'node', id}
let unsub = null;

// ---------- авторизация ----------
const $ = (id) => document.getElementById(id);
function isAuthed() { return sessionStorage.getItem(AUTH_KEY) === "1"; }
function showLogin() { $("login").style.display = "flex"; $("app").style.display = "none"; }
function showApp() { $("login").style.display = "none"; $("app").style.display = "block"; start(); }

function tryLogin() {
  const u = $("user").value.trim(), p = $("pass").value;
  if (u === "Admin" && p === PASSWORD) { sessionStorage.setItem(AUTH_KEY, "1"); showApp(); }
  else { $("loginErr").textContent = "Неверный логин или пароль"; }
}
$("loginBtn").addEventListener("click", tryLogin);
$("pass").addEventListener("keydown", (e) => { if (e.key === "Enter") tryLogin(); });
$("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem(AUTH_KEY); view = { t: "home" }; showLogin();
});
if (isAuthed()) showApp(); else showLogin();

// ---------- данные ----------
function start() {
  if (unsub) return;
  unsub = onSnapshot(collection(db, COL), (snap) => {
    nodes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, (err) => { $("stage").innerHTML = `<div class="empty">Ошибка базы: ${esc(err.message)}</div>`; });
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function title(n){return n["title_"+lang] || n.title_ru || n.title_en || "(без названия)";}
function findNode(id){return nodes.find(n => n.id === id) || null;}
function childrenOf(id){return nodes.filter(n => (n.parentId||null) === (id||null)).sort((a,b)=>(a.order||0)-(b.order||0));}
function genId(){return "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);}
function collectSubtree(id){const out=[id]; childrenOf(id).forEach(c=>out.push(...collectSubtree(c.id))); return out;}

// ---------- отрисовка ----------
function render(){
  if (view.t === "node" && !findNode(view.id)) view = { t:"home" };
  setCrumbs();
  if (view.t === "home") {
    $("stage").innerHTML = listHTML(childrenOf(null)) + addFormHTML(null, "Добавить раздел");
  } else {
    const node = findNode(view.id);
    const kids = childrenOf(node.id);
    let h = `<div class="nodebar">
      <button class="btn ghost" data-back="1">← Назад</button>
      <span class="here">${esc(title(node))}</span>
      <button class="mini ghost" data-rename="${node.id}">Переименовать</button>
      <button class="mini danger" data-del="${node.id}">Удалить</button>
    </div>`;
    h += listHTML(kids) + addFormHTML(node.id, "Добавить пункт");
    $("stage").innerHTML = h;
  }
}

function listHTML(items){
  if (!items.length) return `<div class="empty">Пусто — добавьте пункт ниже</div>`;
  return items.map((n,i)=>rowHTML(n,i,items.length)).join("");
}
function rowHTML(n,i,total){
  const done = !!n.done;
  return `<div class="row${done?" done":""}">
    <label class="chk"><input type="checkbox" data-done="${n.id}" ${done?"checked":""}></label>
    <span class="name" data-open="${n.id}">${esc(title(n))}</span>
    <span class="ord">
      <button class="mini" data-up="${n.id}" ${i===0?"disabled":""}>↑</button>
      <button class="mini" data-down="${n.id}" ${i===total-1?"disabled":""}>↓</button>
    </span>
    <button class="mini" data-open="${n.id}">Открыть →</button>
    <button class="mini ghost" data-rename="${n.id}">✎</button>
    <button class="mini danger" data-del="${n.id}">✕</button>
  </div>`;
}
function addFormHTML(parentId, label){
  return `<div class="addbox">
    <div class="addtitle">${label}</div>
    <input class="in" id="newRu" placeholder="Название (RU)">
    <input class="in" id="newEn" placeholder="Title (EN) — необязательно">
    <button class="btn" data-add="${parentId===null?"":parentId}" data-addnull="${parentId===null?1:0}">+ Добавить</button>
  </div>`;
}
function setCrumbs(){
  let path = [];
  if (view.t === "node") { let c = findNode(view.id); while (c) { path.unshift(c); c = c.parentId ? findNode(c.parentId) : null; } }
  let h = `<span class="crumb" data-home="1">Главная</span>`;
  path.forEach((n,i)=>{ h += " / " + (i===path.length-1
      ? `<span class="crumb cur">${esc(title(n))}</span>`
      : `<span class="crumb" data-open="${n.id}">${esc(title(n))}</span>`); });
  $("crumbs").innerHTML = h;
}

// ---------- события ----------
document.addEventListener("click", async (e) => {
  const lb = e.target.closest("[data-lang]");
  if (lb) { lang = lb.getAttribute("data-lang");
    document.querySelectorAll("[data-lang]").forEach(b=>b.classList.toggle("active", b===lb)); render(); return; }

  if (e.target.closest("[data-home]")) { view = { t:"home" }; render(); return; }

  // Назад — на один уровень вверх
  if (e.target.closest("[data-back]")) {
    const cur = view.t === "node" ? findNode(view.id) : null;
    view = (cur && cur.parentId) ? { t:"node", id:cur.parentId } : { t:"home" };
    render(); return;
  }

  const op = e.target.closest("[data-open]");
  if (op) { view = { t:"node", id: op.getAttribute("data-open") }; render(); return; }

  const ad = e.target.closest("[data-add]");
  if (ad) {
    const ru = ($("newRu").value||"").trim(), en = ($("newEn").value||"").trim();
    if (!ru) { alert("Введите название (RU)"); return; }
    let parentId = ad.getAttribute("data-add");
    if (ad.getAttribute("data-addnull") === "1") parentId = null;
    const sibs = childrenOf(parentId);
    const order = sibs.length ? Math.max(...sibs.map(s=>s.order||0)) + 1 : 0;
    await setDoc(doc(db, COL, genId()), { parentId, order, title_ru: ru, title_en: en || ru, done: false });
    return;
  }

  const rn = e.target.closest("[data-rename]");
  if (rn) {
    const n = findNode(rn.getAttribute("data-rename")); if (!n) return;
    const ru = prompt("Название (RU):", n.title_ru||""); if (ru === null) return;
    const en = prompt("Title (EN):", n.title_en||ru); if (en === null) return;
    await updateDoc(doc(db, COL, n.id), { title_ru: ru.trim(), title_en: (en.trim()||ru.trim()) });
    return;
  }

  const dl = e.target.closest("[data-del]");
  if (dl) {
    const n = findNode(dl.getAttribute("data-del")); if (!n) return;
    const ids = collectSubtree(n.id);
    if (!confirm(`Удалить «${title(n)}»${ids.length>1?` и вложенные (${ids.length} шт.)`:""}? Необратимо.`)) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COL, id)));
    await batch.commit();
    if (view.t === "node" && ids.includes(view.id)) view = n.parentId ? { t:"node", id:n.parentId } : { t:"home" };
    return;
  }

  const up = e.target.closest("[data-up]"), dn = e.target.closest("[data-down]");
  if (up || dn) {
    const id = (up||dn).getAttribute(up ? "data-up" : "data-down");
    const n = findNode(id); if (!n) return;
    const sibs = childrenOf(n.parentId || null);
    const idx = sibs.findIndex(s => s.id === id), j = up ? idx-1 : idx+1;
    if (j < 0 || j >= sibs.length) return;
    const a = sibs[idx], b = sibs[j];
    const batch = writeBatch(db);
    batch.update(doc(db, COL, a.id), { order: b.order||0 });
    batch.update(doc(db, COL, b.id), { order: a.order||0 });
    await batch.commit();
    return;
  }
});

document.addEventListener("change", async (e) => {
  const c = e.target.closest("[data-done]");
  if (c) await updateDoc(doc(db, COL, c.getAttribute("data-done")), { done: c.checked });
});
