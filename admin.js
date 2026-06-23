// salary-admin / admin.js
// Generated with Claude — review before deploy.
import { db } from "./firebase-config.js";
import {
  collection, onSnapshot, doc, setDoc, updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COL = "nodes";
const PASSWORD = "MWYXRddmFDA8";
const AUTH_KEY = "salary_admin_auth";
const CACHE_KEY = "roadmap_nodes_v1";
const PROJECT = (db && db.app && db.app.options && db.app.options.projectId) || "?";

let lang = "ru";
let nodes = [];
let view = { t: "home" };
let addSel = { root: "", sub: "" };
let loaded = false;
let unsub = null;

const $ = (id) => document.getElementById(id);

// ---------- ошибки записи показываем явно ----------
async function safe(promise, what) {
  try { await promise; }
  catch (e) { alert(`Не удалось ${what}.\nПричина: ${e.code || ""} ${e.message}\n\nСкорее всего правила Firestore запрещают запись.`); }
}

// ---------- авторизация ----------
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
  initialPaint();
  if (unsub) return;
  unsub = onSnapshot(collection(db, COL), (snap) => {
    nodes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    loaded = true;
    try { if (nodes.length) localStorage.setItem(CACHE_KEY, JSON.stringify(nodes)); } catch (e) {}
    render();
  }, (err) => {
    loaded = true;
    $("stage").innerHTML = `<div class="empty">Ошибка чтения базы: ${esc(err.message)}<br>Проверь правила Firestore.</div>`;
  });
}
function initialPaint() {
  try { const c = localStorage.getItem(CACHE_KEY); if (c) nodes = JSON.parse(c) || []; } catch (e) {}
  render();
}

function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function title(n){return n["title_"+lang] || n.title_ru || n.title_en || "(без названия)";}
function findNode(id){return nodes.find(n => n.id === id) || null;}
function childrenOf(id){return nodes.filter(n => (n.parentId||null) === (id||null)).sort((a,b)=>(a.order||0)-(b.order||0));}
function genId(){return "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);}
function collectSubtree(id){const out=[id]; childrenOf(id).forEach(c=>out.push(...collectSubtree(c.id))); return out;}

// ---------- приоритет (только у задач-листьев) ----------
function prioSelectHTML(n){
  const cur = n.priority || "";
  const opt = (v,t) => `<option value="${v}" ${cur===v?"selected":""}>${t}</option>`;
  return `<select class="prio-sel" data-prio="${n.id}" title="Приоритет"
    style="background:#101015;color:#f2f2f2;border:1px solid #2a2a31;border-radius:8px;padding:5px 8px;font-size:12px;cursor:pointer">
    ${opt("","— приоритет —")}${opt("highest","Highest")}${opt("high","High")}${opt("medium","Medium")}${opt("low","Low")}</select>`;
}

async function addNode(parentId, ru, en, priority){
  const sibs = childrenOf(parentId);
  const order = sibs.length ? Math.max(...sibs.map(s=>s.order||0)) + 1 : 0;
  await safe(setDoc(doc(db, COL, genId()), { parentId, order, title_ru: ru, title_en: en || ru, done: false, priority: priority || "" }), "добавить пункт");
}

// варианты приоритета для форм добавления
function prioOptionsHTML(sel){
  const cur = sel || "";
  const opt = (v,t) => `<option value="${v}" ${cur===v?"selected":""}>${t}</option>`;
  return opt("","Приоритет — не задан")+opt("highest","Highest")+opt("high","High")+opt("medium","Medium")+opt("low","Low");
}

// ---------- отрисовка ----------
function render(){
  if (view.t === "node" && !findNode(view.id)) view = { t:"home" };
  setCrumbs();
  if (view.t === "home") renderHome();
  else renderNode(findNode(view.id));
  let f = $("diag"); if (f) f.textContent = `проект: ${PROJECT} · пунктов в базе: ${loaded ? nodes.length : "…"}`;
}

function renderHome(){
  const roots = childrenOf(null);
  let h = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
    <span style="font-weight:600;font-size:16px">Разделы</span>
    <button class="mini" data-newroot="1">+ Новый раздел</button>
  </div>`;
  if (roots.length) h += listHTML(roots);
  else h += loaded ? `<div class="empty">База пустая. Открой роадмэп один раз — он зальёт структуру, либо добавь раздел кнопкой выше.</div>` : `<div class="empty">Загрузка…</div>`;
  h += quickAddHTML(roots);
  h += `<div id="diag" style="margin-top:18px;color:#8b8c95;font-size:12px"></div>`;
  $("stage").innerHTML = h;
}

function renderNode(node){
  if (!node) { view = { t:"home" }; return render(); }
  const kids = childrenOf(node.id);
  let h = `<div class="nodebar">
    <button class="btn ghost" data-back="1">← Назад</button>
    <span class="here">${esc(title(node))}</span>
    <button class="mini ghost" data-rename="${node.id}">Переименовать</button>
    <button class="mini danger" data-del="${node.id}">Удалить</button>
  </div>`;
  h += listHTML(kids);
  h += `<div class="addbox">
    <div class="addtitle">Добавить пункт сюда</div>
    <input class="in" id="newRu" placeholder="Название (RU)">
    <input class="in" id="newEn" placeholder="Title (EN) — необязательно">
    <select class="in" id="newPrio">${prioOptionsHTML("")}</select>
    <button class="btn" data-add="${node.id}">+ Добавить</button>
  </div>`;
  h += `<div id="diag" style="margin-top:18px;color:#8b8c95;font-size:12px"></div>`;
  $("stage").innerHTML = h;
}

function listHTML(items){
  if (!items.length) return `<div class="empty">Пусто — добавьте пункт ниже</div>`;
  return items.map((n,i)=>rowHTML(n,i,items.length)).join("");
}
function rowHTML(n,i,total){
  const done = !!n.done;
  const isLeaf = childrenOf(n.id).length === 0;   // приоритет — только у задач без вложений
  return `<div class="row${done?" done":""}">
    <label class="chk"><input type="checkbox" data-done="${n.id}" ${done?"checked":""}></label>
    <span class="name" data-open="${n.id}">${esc(title(n))}</span>
    ${isLeaf ? prioSelectHTML(n) : ""}
    <span class="ord">
      <button class="mini" data-up="${n.id}" ${i===0?"disabled":""}>↑</button>
      <button class="mini" data-down="${n.id}" ${i===total-1?"disabled":""}>↓</button>
    </span>
    <button class="mini" data-open="${n.id}">Открыть →</button>
    <button class="mini ghost" data-rename="${n.id}">✎</button>
    <button class="mini danger" data-del="${n.id}">✕</button>
  </div>`;
}
function quickAddHTML(roots){
  if (!roots.length) return "";
  const rootOpts = `<option value="">— выберите раздел —</option>` +
    roots.map(r=>`<option value="${r.id}" ${addSel.root===r.id?"selected":""}>${esc(title(r))}</option>`).join("");
  return `<div class="addbox">
    <div class="addtitle">Добавить подпункт</div>
    <select class="in" id="selRoot">${rootOpts}</select>
    <select class="in" id="selSub">${subOptionsHTML(addSel.root)}</select>
    <input class="in" id="qRu" placeholder="Название (RU)">
    <input class="in" id="qEn" placeholder="Title (EN) — необязательно">
    <select class="in" id="qPrio">${prioOptionsHTML("")}</select>
    <button class="btn" data-quickadd="1">+ Добавить</button>
  </div>`;
}
function subOptionsHTML(rootId){
  if (!rootId) return `<option value="">— сначала выберите раздел —</option>`;
  const subs = childrenOf(rootId);
  let opts = `<option value="">— прямо в раздел —</option>`;
  opts += subs.map(s=>`<option value="${s.id}" ${addSel.sub===s.id?"selected":""}>${esc(title(s))}</option>`).join("");
  return opts;
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

  if (e.target.closest("[data-back]")) {
    const cur = view.t === "node" ? findNode(view.id) : null;
    view = (cur && cur.parentId) ? { t:"node", id:cur.parentId } : { t:"home" };
    render(); return;
  }

  const op = e.target.closest("[data-open]");
  if (op) { view = { t:"node", id: op.getAttribute("data-open") }; render(); return; }

  if (e.target.closest("[data-newroot]")) {
    const ru = prompt("Название раздела (RU):",""); if (ru===null || !ru.trim()) return;
    const en = prompt("Title (EN):", ru); if (en===null) return;
    await addNode(null, ru.trim(), en.trim()); return;
  }

  const qa = e.target.closest("[data-quickadd]");
  if (qa) {
    if (!addSel.root) { alert("Выберите раздел"); return; }
    const parentId = addSel.sub || addSel.root;
    const ru = ($("qRu").value||"").trim(), en = ($("qEn").value||"").trim();
    const prio = ($("qPrio") && $("qPrio").value) || "";
    if (!ru) { alert("Введите название (RU)"); return; }
    await addNode(parentId, ru, en, prio); return;
  }

  const ad = e.target.closest("[data-add]");
  if (ad) {
    const ru = ($("newRu").value||"").trim(), en = ($("newEn").value||"").trim();
    const prio = ($("newPrio") && $("newPrio").value) || "";
    if (!ru) { alert("Введите название (RU)"); return; }
    await addNode(ad.getAttribute("data-add"), ru, en, prio); return;
  }

  const rn = e.target.closest("[data-rename]");
  if (rn) {
    const n = findNode(rn.getAttribute("data-rename")); if (!n) return;
    const ru = prompt("Название (RU):", n.title_ru||""); if (ru === null) return;
    const en = prompt("Title (EN):", n.title_en||ru); if (en === null) return;
    await safe(updateDoc(doc(db, COL, n.id), { title_ru: ru.trim(), title_en: (en.trim()||ru.trim()) }), "переименовать");
    return;
  }

  const dl = e.target.closest("[data-del]");
  if (dl) {
    const n = findNode(dl.getAttribute("data-del")); if (!n) return;
    const ids = collectSubtree(n.id);
    if (!confirm(`Удалить «${title(n)}»${ids.length>1?` и вложенные (${ids.length} шт.)`:""}? Необратимо.`)) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, COL, id)));
    await safe(batch.commit(), "удалить");
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
    const a = sibs[idx], b = sibs[j], batch = writeBatch(db);
    batch.update(doc(db, COL, a.id), { order: b.order||0 });
    batch.update(doc(db, COL, b.id), { order: a.order||0 });
    await safe(batch.commit(), "переставить");
    return;
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.id === "selRoot") {
    addSel.root = e.target.value; addSel.sub = "";
    const sub = $("selSub"); if (sub) sub.innerHTML = subOptionsHTML(addSel.root); return;
  }
  if (e.target.id === "selSub") { addSel.sub = e.target.value; return; }

  // приоритет задачи
  const ps = e.target.closest("[data-prio]");
  if (ps) { await safe(updateDoc(doc(db, COL, ps.getAttribute("data-prio")), { priority: ps.value }), "сменить приоритет"); return; }

  const c = e.target.closest("[data-done]");
  if (c) await safe(updateDoc(doc(db, COL, c.getAttribute("data-done")), { done: c.checked }), "отметить");
});
