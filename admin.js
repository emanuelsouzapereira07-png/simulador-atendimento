const $ = id => document.getElementById(id);
const localResultsKey='central_concredito_resultados_v15';
let allTrainings=[]; let selectedId=null;
// Cole aqui a URL do backend da Vercel quando ele estiver pronto.
// Exemplo: const BACKEND_BASE_URL = 'https://seu-projeto.vercel.app';
const BACKEND_BASE_URL = '';
function loadLocalResults(){ try{return JSON.parse(localStorage.getItem(localResultsKey)||'[]')}catch{return []} }
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); }
function baseUrl(){ return (BACKEND_BASE_URL||'').replace(/\/api\/analisar\/?$/,'').replace(/\/$/,''); }
function fmtDate(d){ try{return new Date(d).toLocaleString('pt-BR')}catch{return '-'} }
function avg(arr, key){ return arr.length?Math.round(arr.reduce((s,i)=>s+(Number(i[key])||0),0)/arr.length):0 }
function csvEscape(v){ return '"'+String(v??'').replace(/"/g,'""')+'"'; }
async function fetchOnline(){
  const base=baseUrl(); if(!base) throw new Error('Backend não configurado.');
  const res=await fetch(`${base}/api/treinamentos`); if(!res.ok) throw new Error(await res.text());
  const data=await res.json(); return data.items||[];
}
async function loadData(){
  $('adminStatus').textContent='Carregando treinamentos...';
  try{ allTrainings=await fetchOnline(); $('adminStatus').textContent='Dados online carregados pelo banco de dados.'; }
  catch(e){ allTrainings=loadLocalResults(); $('adminStatus').textContent='Mostrando dados locais deste navegador. Configure Supabase para dados online.'; }
  render();
}
function render(){
  const total=allTrainings.length; $('totalTrainings').textContent=total; $('avgGeneral').textContent=avg(allTrainings,'average')+'%'; $('approvedCount').textContent=allTrainings.filter(t=>(t.average||0)>=80).length;
  const byTeam={}; allTrainings.forEach(t=>{ const team=t.seller_team||'Sem time'; byTeam[team]=byTeam[team]||[]; byTeam[team].push(t); });
  $('activeTeams').textContent=Object.keys(byTeam).length; let bestTeam='-'; let bestTeamAvg=-1; Object.entries(byTeam).forEach(([team,items])=>{ const a=avg(items,'average'); if(a>bestTeamAvg){bestTeamAvg=a;bestTeam=team;} }); $('bestTeam').textContent=bestTeam;
  const best=[...allTrainings].sort((a,b)=>(b.average||0)-(a.average||0))[0]; $('bestSeller').textContent=best?best.seller_name:'-';
  $('rankingList').innerHTML=''; [...allTrainings].sort((a,b)=>(b.average||0)-(a.average||0)).slice(0,10).forEach((t,i)=>{ const d=document.createElement('div'); d.className='session-line'; d.innerHTML=`<strong>${i+1}º ${t.seller_name} - ${t.average}%</strong><p>${t.seller_team} • ${t.rank||''} • ${fmtDate(t.created_at)}</p>`; $('rankingList').appendChild(d); });
  $('teamList').innerHTML=''; Object.entries(byTeam).sort((a,b)=>avg(b[1],'average')-avg(a[1],'average')).forEach(([team,items])=>{ const d=document.createElement('div'); d.className='session-line'; d.innerHTML=`<strong>${team} - ${avg(items,'average')}%</strong><p>${items.length} treinamento(s)</p>`; $('teamList').appendChild(d); });
  $('trainingList').innerHTML=''; allTrainings.forEach(t=>{ const d=document.createElement('div'); d.className='session-line admin-row'; d.innerHTML=`<div><strong>${t.seller_name}</strong><small>${t.seller_team}</small></div><div>${fmtDate(t.created_at)}</div><div><strong>${t.average}%</strong></div><div>${t.rank||''}</div><button class="secondary small-btn">Ver treinamento</button>`; d.querySelector('button').onclick=()=>openDetail(t); $('trainingList').appendChild(d); });
}
function openDetail(t){
  selectedId=t.id; $('detailPanel').classList.remove('hidden');
  const html=[`<p><strong>${t.seller_name}</strong> • ${t.seller_team} • ${fmtDate(t.created_at)}</p>`,`<p>Nota: <strong>${t.average}%</strong> • Nível: <strong>${t.rank}</strong> • XP: <strong>${t.xp}</strong></p>`]
  .concat((t.cases||[]).map((c,i)=>`<div class="detail-case"><strong>Caso ${i+1}: ${c.case||''} - ${c.total||0}%</strong><blockquote><b>Cliente:</b> ${c.clientMessage||''}</blockquote><blockquote><b>Resposta do vendedor:</b> ${c.answer||''}</blockquote><p><b>Comentário IA:</b> ${c.comment||c.feedback||''}</p><p><b>Resposta recomendada:</b> ${c.suggested||''}</p></div>`)).join('');
  $('detailContent').innerHTML=html; window.scrollTo({top:$('detailPanel').offsetTop-30,behavior:'smooth'});
}
async function deleteSelected(){
  if(!selectedId)return; if(!confirm('Deseja apagar este histórico?'))return;
  const base=baseUrl();
  if(base){ try{ await fetch(`${base}/api/excluir`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:selectedId})}); }catch(e){ console.warn(e); } }
  const local=loadLocalResults().filter(t=>t.id!==selectedId); localStorage.setItem(localResultsKey,JSON.stringify(local)); allTrainings=allTrainings.filter(t=>t.id!==selectedId); $('detailPanel').classList.add('hidden'); render();
}
function exportCsv(){
  const rows=[['Nome','Time','Data','Nota','Nivel','XP','Casos','Tempo segundos']].concat(allTrainings.map(t=>[t.seller_name,t.seller_team,t.created_at,t.average,t.rank,t.xp,t.solved,t.duration_seconds]));
  const csv=rows.map(r=>r.map(csvEscape).join(';')).join('\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='treinamentos_concredito.csv'; a.click(); URL.revokeObjectURL(a.href);
}
function exportPdf(){ window.print(); }
$('backHome').onclick=()=>location.href='index.html';
$('loginBtn').onclick=()=>{ if($('adminUser').value==='suporte' && $('adminPass').value==='suporte123'){ show('dashboardScreen'); loadData(); } else alert('Usuário ou senha inválidos.'); };
$('refreshBtn').onclick=loadData; $('exportCsvBtn').onclick=exportCsv; $('exportPdfBtn').onclick=exportPdf; $('logoutBtn').onclick=()=>show('loginScreen'); $('closeDetailBtn').onclick=()=>$('detailPanel').classList.add('hidden'); $('deleteTrainingBtn').onclick=deleteSelected;
