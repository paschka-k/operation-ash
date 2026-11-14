// Reads .autopilot/data.mjs (the single source of truth), checks the gates and writes
//   .autopilot/state.json      machine readable state
//   .autopilot/manifest.md     requirements with status
//   .autopilot/spec.md         stories grouped by epic, with acceptance and evidence
//   .autopilot/overview.html   one page overview, opens with a double click
// Usage: npm run dashboard        (exit code 1 when a gate fails)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '.autopilot');
const data = await import(pathToFileURL(path.join(dir, 'data.mjs')).href);
const { project, requirements, epics, stories, gates } = data;

const RANK = { done: 0, partial: 1, placeholder: 2, deferred: 3 };
const LABEL = { done: 'сделано', partial: 'частично', placeholder: 'заглушка', deferred: 'отложено' };
const VERIFIED = { tests: 'тесты', browser: 'браузер', static: 'разбор файла', review: 'независимая проверка', code: 'только код', pending: 'не проверено' };
const KIND = { brief: 'бриф', followup: 'уточнение', implied: 'подразумевается', request: 'запрос', proposal: 'предложение' };

// ---------------------------------------------------------------- derive
const byReq = new Map(requirements.map((r) => [r.id, []]));
for (const s of stories) for (const id of s.req) if (byReq.has(id)) byReq.get(id).push(s);
for (const r of requirements) {
  const list = byReq.get(r.id);
  r.stories = list.map((s) => s.id);
  r.status = list.length ? list.reduce((worst, s) => (RANK[s.status] > RANK[worst] ? s.status : worst), 'done') : 'open';
  r.weakest = list.filter((s) => s.status !== 'done' || s.verified === 'code' || s.verified === 'pending').map((s) => s.id);
}

// ----------------------------------------------------------------- gates
const results = [];
const g1 = requirements.filter((r) => !r.stories.length).map((r) => r.id);
results.push({ id: 'G1', name: gates[0].name, ok: g1.length === 0, detail: g1.length ? 'без истории: ' + g1.join(', ') : `${requirements.length} требований, у каждого есть история` });
const badStories = stories.filter((s) => !s.acceptance || !s.status || !(s.status in RANK) || !s.req.length || s.req.some((id) => !byReq.has(id))).map((s) => s.id);
const dup = stories.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
results.push({ id: 'G2', name: gates[1].name, ok: !badStories.length && !dup.length, detail: badStories.length || dup.length ? 'ошибки: ' + [...badStories, ...dup].join(', ') : `${stories.length} историй проверены` });
const open = stories.filter((s) => s.status !== 'done');
const unexplained = open.filter((s) => !s.evidence || s.evidence.length < 8).map((s) => s.id);
results.push({ id: 'G3', name: gates[2].name, ok: !unexplained.length, detail: unexplained.length ? 'без причины: ' + unexplained.join(', ') : `${open.length} историй не закрыты полностью, у каждой названа причина` });

// --------------------------------------------------------------- numbers
const count = (list, key, val) => list.filter((x) => x[key] === val).length;
const totals = {
  requirements: requirements.length,
  reqDone: count(requirements, 'status', 'done'),
  reqPartial: count(requirements, 'status', 'partial'),
  reqDeferred: count(requirements, 'status', 'deferred') + count(requirements, 'status', 'placeholder'),
  stories: stories.length,
  storiesDone: count(stories, 'status', 'done'),
  verifiedTests: count(stories, 'verified', 'tests'),
  verifiedBrowser: count(stories, 'verified', 'browser'),
  verifiedCode: count(stories, 'verified', 'code'),
  pending: count(stories, 'verified', 'pending'),
};

fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ project, totals, gates: results, requirements, stories }, null, 2) + '\n');

// -------------------------------------------------------------- manifest
let md = '# Манифест требований\n\n';
md += 'Создан командой `npm run dashboard` из `.autopilot/data.mjs`. Не править вручную.\n\n';
md += 'Дословные цитаты помечены «д». Остальное восстановлено по скриншотам и пересказано. Убрать требование может только пользователь.\n\n';
md += '| ID | Источник | Требование | Статус | Истории |\n|----|----------|------------|--------|---------|\n';
for (const r of requirements) {
  const q = r.verbatim ? `«${r.text}» д` : r.text;
  md += `| ${r.id} | ${KIND[r.kind]} | ${q}${r.note ? ' <br>_' + r.note + '_' : ''} | ${LABEL[r.status] || r.status} | ${r.stories.join(', ')} |\n`;
}
md += `\nИтого: ${totals.reqDone} из ${totals.requirements} сделано, ${totals.reqPartial} частично, ${totals.reqDeferred} отложено.\n`;
fs.writeFileSync(path.join(dir, 'manifest.md'), md);

// ------------------------------------------------------------------ spec
let sp = '# Спецификация\n\n';
sp += 'Создана командой `npm run dashboard` из `.autopilot/data.mjs`. Формат: история, приёмка, требования, статус, чем проверено.\n\n';
for (const [id, title] of Object.entries(epics)) {
  const list = stories.filter((s) => s.epic === id);
  if (!list.length) continue;
  sp += `## ${id} ${title}\n\n`;
  for (const s of list) {
    sp += `- **${s.id}** ${s.text}\n  - Приёмка: ${s.acceptance}\n  - Требования: ${s.req.join(', ')}. Статус: ${LABEL[s.status]}. Проверено: ${VERIFIED[s.verified]}.\n  - Доказательство: ${s.evidence}\n`;
  }
  sp += '\n';
}
fs.writeFileSync(path.join(dir, 'spec.md'), sp);

// ------------------------------------------------------------- dashboard
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pill = (st) => `<span class="pill ${st}">${LABEL[st] || st}</span>`;
const reqRows = requirements.map((r) => `<tr class="${r.status}"><td>${r.id}</td><td>${KIND[r.kind]}</td><td>${r.verbatim ? '«' + esc(r.text) + '»' : esc(r.text)}${r.note ? `<div class="note">${esc(r.note)}</div>` : ''}</td><td>${pill(r.status)}</td><td class="mono">${r.stories.join(' ')}</td></tr>`).join('\n');
const storyRows = Object.entries(epics).map(([id, title]) => {
  const list = stories.filter((s) => s.epic === id);
  return `<tbody><tr class="epic"><th colspan="5">${id} ${esc(title)} <span class="count">${list.filter((s) => s.status === 'done').length}/${list.length}</span></th></tr>` + list.map((s) => `<tr class="${s.status}"><td class="mono">${s.id}</td><td>${esc(s.text)}<div class="note">${esc(s.acceptance)}</div></td><td>${pill(s.status)}</td><td>${VERIFIED[s.verified]}</td><td class="note">${esc(s.evidence)}</td></tr>`).join('\n') + '</tbody>';
}).join('\n');
const gateRows = results.map((g) => `<div class="gate ${g.ok ? 'ok' : 'bad'}"><b>${g.id} ${g.ok ? 'пройден' : 'не пройден'}</b> ${esc(g.name)}<div class="note">${esc(g.detail)}</div></div>`).join('\n');
const card = (n, label) => `<div class="card"><div class="n">${n}</div><div>${label}</div></div>`;

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Дашборд: ${esc(project.name)}</title>
<style>
:root{--bg:#14161a;--fg:#e6e3dc;--mut:#9a978f;--line:#2b2f36;--ok:#5fb36b;--part:#e0a93b;--def:#d9604c;--card:#1c1f25}
@media (prefers-color-scheme:light){:root{--bg:#f6f4ef;--fg:#1d1c19;--mut:#6c6a63;--line:#d9d5cb;--card:#fff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,Segoe UI,sans-serif;padding:24px 16px 60px}
main{max-width:1180px;margin:0 auto}h1{margin:0 0 4px;font-size:26px}h2{margin:34px 0 10px;font-size:19px}
.sub{color:var(--mut);margin-bottom:18px}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px}.n{font-size:28px;font-weight:700}
.gates{display:grid;gap:8px}.gate{border-left:4px solid var(--ok);background:var(--card);padding:8px 12px;border-radius:4px}.gate.bad{border-color:var(--def)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}td,th{padding:7px 9px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
th{font-weight:600}tr.epic th{background:rgba(127,127,127,.12)}.mono{font-family:ui-monospace,Consolas,monospace;font-size:13px}td.mono{max-width:230px;word-break:break-word}
.note{color:var(--mut);font-size:13px}.count{color:var(--mut);font-weight:400;margin-left:6px}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid currentColor;white-space:nowrap}
.pill.done{color:var(--ok)}.pill.partial,.pill.placeholder{color:var(--part)}.pill.deferred,.pill.open{color:var(--def)}
.filter{margin:6px 0 10px;display:flex;gap:6px;flex-wrap:wrap}.filter button{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}
.filter button.on{border-color:var(--fg)}@media(max-width:700px){td,th{padding:6px 5px;font-size:13px}}
</style></head><body><main>
<h1>${esc(project.name)}</h1>
<div class="sub">${esc(project.brief)} · данные от ${project.date}</div>
<div class="cards">
${card(`${totals.reqDone}/${totals.requirements}`, 'требований сделано')}
${card(`${totals.storiesDone}/${totals.stories}`, 'историй сделано')}
${card(totals.verifiedTests, 'проверено тестами')}
${card(totals.verifiedBrowser, 'проверено в браузере')}
${card(totals.verifiedCode, 'проверено чтением кода')}
${card(totals.reqPartial + totals.reqDeferred, 'требований с оговоркой')}
</div>
<h2>Ворота</h2><div class="gates">${gateRows}</div>
<h2>Требования</h2>
<div class="filter" id="f1"><button data-s="all" class="on">все</button><button data-s="done">сделано</button><button data-s="partial">частично</button><button data-s="deferred">отложено</button></div>
<table id="reqs"><thead><tr><th>ID</th><th>Источник</th><th>Требование</th><th>Статус</th><th>Истории</th></tr></thead><tbody>
${reqRows}
</tbody></table>
<h2>Истории</h2>
<table id="stories"><thead><tr><th>ID</th><th>История и приёмка</th><th>Статус</th><th>Проверено</th><th>Доказательство</th></tr></thead>
${storyRows}
</table>
</main>
<script>
document.querySelectorAll('#f1 button').forEach(function(b){b.onclick=function(){
  document.querySelectorAll('#f1 button').forEach(function(x){x.classList.toggle('on',x===b)});
  var s=b.dataset.s;document.querySelectorAll('#reqs tbody tr').forEach(function(tr){
    tr.style.display=(s==='all'||tr.classList.contains(s)||(s==='deferred'&&tr.classList.contains('placeholder')))?'':'none';});};});
</script></body></html>
`;
fs.writeFileSync(path.join(dir, 'overview.html'), html);

// ---------------------------------------------------------------- report
console.log(`${project.name}: ${totals.reqDone}/${totals.requirements} требований, ${totals.storiesDone}/${totals.stories} историй`);
for (const g of results) console.log(`${g.ok ? 'PASS' : 'FAIL'} ${g.id} ${g.name}: ${g.detail}`);
console.log('written: state.json manifest.md spec.md overview.html');
process.exit(results.every((g) => g.ok) ? 0 : 1);
