const KEY = "agenda-clube-potiguar-v1";
const META = 150;
const STATUS = {
  prospeccao: "Prospecção",
  visitado: "Visitado",
  negociando: "Negociando",
  fechado: "Fechado",
  perdido: "Perdido",
};
const KIND_LABEL = { event: "compromisso", task: "tarefa", deal: "loja", note: "anotação" };

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let db = load();
let calMonth = startOfMonth(new Date());
let selectedDay = isoDate(new Date());
let taskFilter = "pending";
let dealFilter = "open";
let editing = null;
let formKind = "event";

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.items)) return raw;
  } catch (e) {}
  return { items: [] };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    toast("Não foi possível salvar neste navegador.");
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function isoDate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fmtDate(iso, opts = { day: "2-digit", month: "2-digit" }) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", opts);
}

function money(n) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function byKind(kind) {
  return db.items.filter((i) => i.kind === kind);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}

function renderHeader() {
  const now = new Date();
  const h = now.getHours();
  const hello = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  $("#greeting").textContent = `${hello}, Luis`;
  $("#today-label").textContent = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const f = FRASES[dayOfYear % FRASES.length];
  $("#quote-text").textContent = f.t;
  $("#quote-ref").textContent = f.r;
  $("#quote-ref").hidden = !f.r;
}

function renderStats() {
  const today = isoDate(new Date());
  const closed = byKind("deal").filter((d) => d.status === "fechado");
  const mrr = closed.reduce((s, d) => s + Number(d.plan || 0), 0);
  $("#st-events").textContent = byKind("event").filter((e) => e.date === today && !e.done).length;
  $("#st-tasks").textContent = byKind("task").filter((t) => !t.done).length;
  $("#st-deals").textContent = closed.length;
  $("#st-mrr").textContent = money(mrr);
  const pct = Math.min(100, Math.round((closed.length / META) * 100));
  $("#goal-pct").textContent = `${closed.length} de ${META} (${pct}%)`;
  $("#goal-bar").style.width = `${Math.max(pct, closed.length ? 2 : 0)}%`;
}

function sortByDateTime(a, b) {
  return `${a.date || "9999"}${a.time || "99"}`.localeCompare(`${b.date || "9999"}${b.time || "99"}`);
}

function itemHTML(i) {
  const today = isoDate(new Date());
  let meta = [];
  let check = "";
  let badge = "";
  if (i.kind === "event") {
    meta.push([fmtDate(i.date), i.time].filter(Boolean).join(" às "));
    if (i.place) meta.push(i.place);
    check = `<button type="button" class="check ${i.done ? "on" : ""}" data-toggle="${i.id}" aria-label="Marcar como feito"></button>`;
  }
  if (i.kind === "task") {
    if (i.date) meta.push((i.date < today && !i.done ? "Atrasada: " : "Até ") + fmtDate(i.date));
    if (i.priority === "alta") badge = `<em class="badge red">Alta</em>`;
    check = `<button type="button" class="check ${i.done ? "on" : ""}" data-toggle="${i.id}" aria-label="Marcar como feita"></button>`;
  }
  if (i.kind === "deal") {
    badge = `<em class="badge s-${i.status}">${STATUS[i.status]}</em>`;
    if (i.place2) meta.push(i.place2);
    if (i.next) meta.push(`Próximo: ${i.next}${i.date ? " (" + fmtDate(i.date) + ")" : ""}`);
    if (i.status === "fechado") meta.push(`R$ ${i.plan}/mês`);
  }
  if (i.kind === "note") {
    meta.push(fmtDate(i.date, { weekday: "short", day: "2-digit", month: "2-digit" }));
  }
  const wa = i.kind === "deal" && i.contact ? `<a class="wa" href="https://wa.me/55${String(i.contact).replace(/\D/g, "").replace(/^55/, "")}" target="_blank" rel="noopener">WhatsApp</a>` : "";
  const notes = i.notes ? `<p class="notes">${esc(i.notes)}</p>` : "";
  return `<li class="item ${i.done ? "done" : ""}">
    ${check}
    <div class="item-body" data-edit="${i.id}">
      <div class="item-title">${esc(i.title)} ${badge}</div>
      ${meta.length ? `<div class="item-meta">${esc(meta.join(" · "))}</div>` : ""}
      ${notes}
    </div>
    ${wa}
  </li>`;
}

function fill(sel, items, empty) {
  $(sel).innerHTML = items.length ? items.map(itemHTML).join("") : `<li class="empty">${empty}</li>`;
}

function renderToday() {
  const today = isoDate(new Date());
  fill("#today-events", byKind("event").filter((e) => e.date === today).sort(sortByDateTime), "Nenhum compromisso hoje.");
  fill("#today-tasks", byKind("task").filter((t) => !t.done && (!t.date || t.date <= today)).sort(sortByDateTime), "Tudo em dia.");
  fill(
    "#today-deals",
    byKind("deal").filter((d) => !["fechado", "perdido"].includes(d.status) && d.next).sort(sortByDateTime).slice(0, 6),
    "Cadastre as lojas que você visitar na aba Negócios.",
  );
}

function renderCalendar() {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  $("#cal-title").textContent = calMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = isoDate(new Date());
  const busy = new Set(db.items.filter((i) => i.kind === "event" || (i.kind === "task" && !i.done)).map((i) => i.date));
  let html = "";
  for (let i = 0; i < first; i++) html += `<span></span>`;
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(y, m, d));
    const cls = [iso === today ? "today" : "", iso === selectedDay ? "sel" : "", busy.has(iso) ? "dot" : ""].join(" ");
    html += `<button type="button" class="${cls}" data-day="${iso}">${d}</button>`;
  }
  $("#cal-grid").innerHTML = html;
  $("#day-title").textContent = fmtDate(selectedDay, { weekday: "long", day: "numeric", month: "long" });
  const items = db.items.filter((i) => (i.kind === "event" || i.kind === "task") && i.date === selectedDay).sort(sortByDateTime);
  fill("#day-events", items, "Nada marcado neste dia.");
}

function renderTasks() {
  let items = byKind("task");
  if (taskFilter === "pending") items = items.filter((t) => !t.done);
  if (taskFilter === "done") items = items.filter((t) => t.done);
  items.sort((a, b) => (a.priority === "alta" ? -1 : 0) - (b.priority === "alta" ? -1 : 0) || sortByDateTime(a, b));
  fill("#task-list", items, taskFilter === "done" ? "Nenhuma tarefa feita ainda." : "Nenhuma tarefa pendente.");
}

function renderDeals() {
  const all = byKind("deal");
  $("#funnel").innerHTML = Object.entries(STATUS)
    .map(([k, v]) => `<div class="fun s-${k}"><b>${all.filter((d) => d.status === k).length}</b><span>${v}</span></div>`)
    .join("");
  let items = all;
  if (dealFilter === "open") items = all.filter((d) => !["fechado", "perdido"].includes(d.status));
  else if (dealFilter !== "all") items = all.filter((d) => d.status === dealFilter);
  items.sort(sortByDateTime);
  fill("#deal-list", items, "Nenhuma loja aqui ainda.");
}

function renderNotes() {
  const items = byKind("note").sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.created - a.created);
  fill("#note-list", items, "Anote aqui o que você fez no dia: visitas, ligações, ideias.");
}

function render() {
  renderStats();
  renderToday();
  renderCalendar();
  renderTasks();
  renderDeals();
  renderNotes();
}

function setTab(tab) {
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
}

function setKind(kind) {
  formKind = kind;
  $$("#kinds button").forEach((b) => b.classList.toggle("active", b.dataset.kind === kind));
  $$("[data-for]").forEach((el) => (el.hidden = !el.dataset.for.split(" ").includes(kind)));
  $("#lbl-title").textContent = kind === "deal" ? "Nome da loja" : kind === "note" ? "O que você fez" : "Título";
  $("#lbl-date").textContent = kind === "task" ? "Prazo" : kind === "deal" ? "Data do próximo passo" : "Data";
}

function openForm(kind, item) {
  editing = item || null;
  const f = $("#form");
  f.reset();
  $("#kinds").hidden = !!item;
  $("#btn-delete").hidden = !item;
  setKind(item ? item.kind : kind);
  $("#form-title").textContent = item ? `Editar ${KIND_LABEL[item.kind]}` : "Adicionar";
  const tab = $(".panel.active").id;
  f.date.value = item ? item.date || "" : tab === "panel-agenda" ? selectedDay : kind === "deal" ? "" : isoDate(new Date());
  if (item) {
    ["title", "time", "place", "priority", "status", "plan", "contact", "place2", "next", "notes"].forEach((k) => {
      if (f[k] && item[k] != null) f[k].value = item[k];
    });
  }
  $("#sheet").showModal();
  setTimeout(() => f.title.focus(), 50);
}

function submitForm(e) {
  e.preventDefault();
  const f = $("#form");
  const data = { kind: formKind, title: f.title.value.trim(), date: f.date.value, notes: f.notes.value.trim() };
  if (!data.title) return;
  if (formKind === "event") Object.assign(data, { time: f.time.value, place: f.place.value.trim() });
  if (formKind === "task") Object.assign(data, { priority: f.priority.value });
  if (formKind === "deal") {
    Object.assign(data, { status: f.status.value, plan: f.plan.value, contact: f.contact.value.trim(), place2: f.place2.value.trim(), next: f.next.value.trim() });
  }
  if (editing) {
    const wasClosed = editing.status === "fechado";
    Object.assign(editing, data);
    if (formKind === "deal" && data.status === "fechado" && !wasClosed) celebrate(data.title);
  } else {
    db.items.push({ id: uid(), created: Date.now(), done: false, ...data });
    if (formKind === "deal" && data.status === "fechado") celebrate(data.title);
    else toast("Salvo.");
  }
  save();
  $("#sheet").close();
  render();
}

function celebrate(name) {
  const n = byKind("deal").filter((d) => d.status === "fechado").length;
  toast(`Fechou com ${name}! Agora são ${n} de ${META}.`);
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `agenda-clube-potiguar-${isoDate(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      if (!data || !Array.isArray(data.items)) throw new Error();
      if (!confirm(`Restaurar ${data.items.length} itens? Os dados atuais serão substituídos.`)) return;
      db = data;
      save();
      render();
      $("#backup").close();
      toast("Backup restaurado.");
    } catch (e) {
      toast("Arquivo de backup inválido.");
    }
  };
  r.readAsText(file);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, [data-edit]");
  if (!t) return;
  if (t.dataset.tab) setTab(t.dataset.tab);
  if (t.dataset.toggle) {
    const it = db.items.find((i) => i.id === t.dataset.toggle);
    it.done = !it.done;
    save();
    render();
    if (it.done) toast("Feito!");
  }
  if (t.dataset.edit) openForm(null, db.items.find((i) => i.id === t.dataset.edit));
  if (t.dataset.new) openForm(t.dataset.new);
  if (t.dataset.kind) setKind(t.dataset.kind);
  if (t.dataset.day) {
    selectedDay = t.dataset.day;
    renderCalendar();
  }
  if (t.dataset.f && t.closest("#task-filter")) {
    taskFilter = t.dataset.f;
    $$("#task-filter button").forEach((b) => b.classList.toggle("active", b === t));
    renderTasks();
  }
  if (t.dataset.f && t.closest("#deal-filter")) {
    dealFilter = t.dataset.f;
    $$("#deal-filter button").forEach((b) => b.classList.toggle("active", b === t));
    renderDeals();
  }
});

$("#fab").addEventListener("click", () => {
  const tab = $(".panel.active").id.replace("panel-", "");
  openForm({ hoje: "task", agenda: "event", tarefas: "task", negocios: "deal", diario: "note" }[tab]);
});
$("#form").addEventListener("submit", submitForm);
$("#btn-cancel").addEventListener("click", () => $("#sheet").close());
$("#btn-delete").addEventListener("click", () => {
  if (!editing || !confirm("Excluir este item?")) return;
  db.items = db.items.filter((i) => i !== editing);
  save();
  $("#sheet").close();
  render();
  toast("Excluído.");
});
$("#cal-prev").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1);
  renderCalendar();
});
$("#cal-next").addEventListener("click", () => {
  calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1);
  renderCalendar();
});
$("#btn-backup").addEventListener("click", () => $("#backup").showModal());
$("#btn-close-backup").addEventListener("click", () => $("#backup").close());
$("#btn-export").addEventListener("click", exportBackup);
$("#file-import").addEventListener("change", (e) => e.target.files[0] && importBackup(e.target.files[0]));

renderHeader();
render();
setInterval(renderHeader, 60000);
