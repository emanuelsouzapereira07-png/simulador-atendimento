const $ = id => document.getElementById(id);

const ADMIN_USER = 'suporte';
const ADMIN_PASS = 'suporte123';
const BACKEND_BASE_URL = 'https://backend-do-simulador-con-cr-dito-git-main-suporte3.vercel.app';
const localResultsKey = 'central_concredito_resultados_v15';

let allTrainings = [];
let selectedId = null;

function show(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function baseUrl(){
  return (BACKEND_BASE_URL || '').replace(/\/$/, '');
}

function fmtDate(value){
  if(!value) return '-';
  try { return new Date(value).toLocaleString('pt-BR'); } catch { return '-'; }
}

function number(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function avg(items, key){
  if(!items.length) return 0;
  return Math.round(items.reduce((sum, item) => sum + number(item[key]), 0) / items.length);
}

function loadLocalResults(){
  try { return JSON.parse(localStorage.getItem(localResultsKey) || '[]'); }
  catch { return []; }
}

function normalizeTraining(t){
  return {
    id: t.id || '',
    seller_name: t.seller_name || t.nome || 'Sem nome',
    seller_team: t.seller_team || t.equipe || 'Sem time',
    created_at: t.created_at || t.criado_em || new Date().toISOString(),
    started_at: t.started_at || null,
    ended_at: t.ended_at || null,
    duration_seconds: number(t.duration_seconds),
    difficulty: t.difficulty || '-',
    mode: t.mode || '-',
    target_cases: number(t.target_cases),
    solved: number(t.solved || t.cases?.length),
    score: number(t.score),
    average: number(t.average || t.nota),
    xp: number(t.xp),
    rank: t.rank || t.nivel || '-',
    metrics: t.metrics || {},
    cases: Array.isArray(t.cases) ? t.cases : []
  };
}

async function fetchOnline(){
  const res = await fetch(`${baseUrl()}/api/treinamentos?t=${Date.now()}`, { cache: 'no-store' });
  if(!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.items || []).map(normalizeTraining);
}

async function loadData(){
  $('adminStatus').textContent = 'Carregando dados do banco...';
  try{
    allTrainings = await fetchOnline();
    $('adminStatus').textContent = `Dados online carregados. ${allTrainings.length} treinamento(s) encontrado(s).`;
  }catch(error){
    console.warn('Falha ao buscar online:', error);
    allTrainings = loadLocalResults().map(normalizeTraining);
    $('adminStatus').textContent = 'Não foi possível buscar o banco. Mostrando apenas dados locais deste navegador.';
  }
  render();
}

function csvEscape(value){
  return '"' + String(value ?? '').replace(/"/g, '""') + '"';
}

function render(){
  const total = allTrainings.length;
  $('totalTrainings').textContent = total;
  $('avgGeneral').textContent = avg(allTrainings, 'average') + '%';
  $('approvedCount').textContent = allTrainings.filter(t => number(t.average) >= 80).length;

  const byTeam = {};
  allTrainings.forEach(t => {
    const team = t.seller_team || 'Sem time';
    if(!byTeam[team]) byTeam[team] = [];
    byTeam[team].push(t);
  });

  $('activeTeams').textContent = Object.keys(byTeam).length;

  let bestTeam = '-';
  let bestTeamAvg = -1;
  Object.entries(byTeam).forEach(([team, items]) => {
    const teamAvg = avg(items, 'average');
    if(teamAvg > bestTeamAvg){
      bestTeamAvg = teamAvg;
      bestTeam = team;
    }
  });
  $('bestTeam').textContent = bestTeam;

  const bestSeller = [...allTrainings].sort((a,b) => number(b.average) - number(a.average))[0];
  $('bestSeller').textContent = bestSeller ? bestSeller.seller_name : '-';

  renderRanking();
  renderTeams(byTeam);
  renderTrainingList();
}

function renderRanking(){
  const box = $('rankingList');
  box.innerHTML = '';
  const list = [...allTrainings].sort((a,b) => number(b.average) - number(a.average)).slice(0, 10);
  if(!list.length){
    box.innerHTML = '<p class="muted">Nenhum treinamento salvo ainda.</p>';
    return;
  }
  list.forEach((t, index) => {
    const div = document.createElement('div');
    div.className = 'session-line';
    div.innerHTML = `<strong>${index + 1}º ${t.seller_name} - ${t.average}%</strong><p>${t.seller_team} • ${t.rank || '-'} • ${fmtDate(t.created_at)}</p>`;
    box.appendChild(div);
  });
}

function renderTeams(byTeam){
  const box = $('teamList');
  box.innerHTML = '';
  const entries = Object.entries(byTeam).sort((a,b) => avg(b[1], 'average') - avg(a[1], 'average'));
  if(!entries.length){
    box.innerHTML = '<p class="muted">Nenhum time com treinamento salvo.</p>';
    return;
  }
  entries.forEach(([team, items]) => {
    const div = document.createElement('div');
    div.className = 'session-line';
    div.innerHTML = `<strong>${team} - ${avg(items, 'average')}%</strong><p>${items.length} treinamento(s)</p>`;
    box.appendChild(div);
  });
}

function renderTrainingList(){
  const box = $('trainingList');
  box.innerHTML = '';
  const list = [...allTrainings].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if(!list.length){
    box.innerHTML = '<p class="muted">Nenhum treinamento salvo no banco ainda.</p>';
    return;
  }
  list.forEach(t => {
    const div = document.createElement('div');
    div.className = 'session-line admin-row';
    div.innerHTML = `
      <div><strong>${t.seller_name}</strong><small>${t.seller_team}</small></div>
      <div>${fmtDate(t.created_at)}</div>
      <div><strong>${t.average}%</strong></div>
      <div>${t.rank || '-'}</div>
      <button class="secondary small-btn" type="button">Ver treinamento</button>
    `;
    div.querySelector('button').onclick = () => openDetail(t);
    box.appendChild(div);
  });
}

function openDetail(t){
  selectedId = t.id;
  $('detailPanel').classList.remove('hidden');

  const cases = Array.isArray(t.cases) ? t.cases : [];
  const casesHtml = cases.length ? cases.map((c, i) => `
    <div class="detail-case">
      <strong>Caso ${i + 1}: ${c.case || c.type || 'Atendimento'} - ${number(c.total)}%</strong>
      <blockquote><b>Cliente:</b> ${c.clientMessage || c.message || ''}</blockquote>
      <blockquote><b>Resposta do vendedor:</b> ${c.answer || ''}</blockquote>
      <p><b>Comentário IA:</b> ${c.comment || c.feedback || ''}</p>
      <p><b>Resposta recomendada:</b> ${c.suggested || ''}</p>
    </div>
  `).join('') : '<p class="muted">Este treinamento não possui detalhes dos casos salvos.</p>';

  $('detailContent').innerHTML = `
    <p><strong>${t.seller_name}</strong> • ${t.seller_team} • ${fmtDate(t.created_at)}</p>
    <p>Nota: <strong>${t.average}%</strong> • Nível: <strong>${t.rank || '-'}</strong> • XP: <strong>${t.xp}</strong></p>
    <p>Dificuldade: <strong>${t.difficulty || '-'}</strong> • Casos respondidos: <strong>${t.solved || cases.length}</strong></p>
    ${casesHtml}
  `;
  window.scrollTo({ top: $('detailPanel').offsetTop - 30, behavior: 'smooth' });
}

async function deleteSelected(){
  if(!selectedId) return;
  if(!confirm('Deseja apagar este histórico?')) return;
  try{
    const res = await fetch(`${baseUrl()}/api/excluir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId })
    });
    if(!res.ok) throw new Error(await res.text());
  }catch(error){
    alert('Não foi possível apagar no banco: ' + error.message);
    return;
  }
  selectedId = null;
  $('detailPanel').classList.add('hidden');
  await loadData();
}

function exportCsv(){
  const rows = [['Nome','Time','Data','Nota','Nível','XP','Casos','Tempo segundos']].concat(
    allTrainings.map(t => [t.seller_name, t.seller_team, t.created_at, t.average, t.rank, t.xp, t.solved, t.duration_seconds])
  );
  const csv = rows.map(r => r.map(csvEscape).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'treinamentos_concredito.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPdf(){
  window.print();
}

$('backHome').onclick = () => location.href = 'index.html';
$('loginBtn').onclick = () => {
  if($('adminUser').value === ADMIN_USER && $('adminPass').value === ADMIN_PASS){
    show('dashboardScreen');
    loadData();
  } else {
    alert('Usuário ou senha inválidos.');
  }
};
$('refreshBtn').onclick = loadData;
$('exportCsvBtn').onclick = exportCsv;
$('exportPdfBtn').onclick = exportPdf;
$('logoutBtn').onclick = () => show('loginScreen');
$('closeDetailBtn').onclick = () => $('detailPanel').classList.add('hidden');
$('deleteTrainingBtn').onclick = deleteSelected;
