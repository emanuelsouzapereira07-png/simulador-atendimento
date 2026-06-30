const $ = (id) => document.getElementById(id);
const screens = { start:$('startScreen'), how:$('howScreen'), game:$('gameScreen'), result:$('resultScreen') };
const caseBank = window.CONCREDITO_CASES || [];
const storageKey = 'central_concredito_vendas_v15';
const localResultsKey = 'central_concredito_resultados_v15';
const teams = ['Savana','Santo Crédito','Construindo Sonhos','Tropa de Elite','Esquadrão Fênix'];

let state = freshState();
const BACKEND_BASE_URL = 'https://backend-do-simulador-con-cr-dito-git-main-suporte3.vercel.app';


function freshState(){
  return {
    sellerName:'', sellerTeam:'', totalTime:300, timeLeft:300, targetCases:10,
    timerId:null, queueTimer:null, queue:[], activeCase:null, historyOpened:false,
    score:0, solved:0, responses:0, xp:0, sessionHistory:[], startedAt:null, endedAt:null,
    totals:{context:0,diagnosis:0,action:0,safety:0,empathy:0,commercial:0}
  };
}
function show(screen){ Object.values(screens).forEach(s=>s.classList.remove('active')); screen.classList.add('active'); }
function normalize(text){ return (text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function hasAny(text, terms){ const a=normalize(text); return terms.some(t=>a.includes(normalize(t))); }
function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,Math.round(v))); }
function fmt(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function backendBase(){ return (BACKEND_BASE_URL||'').replace(/\/api\/analisar\/?$/,'').replace(/\/$/,''); }
function analyzeUrl(){ const base=backendBase(); return base ? `${base}/api/analisar` : ''; }
function loadProfile(){ try{return {bestAverage:0,totalXp:0,...JSON.parse(localStorage.getItem(storageKey)||'{}')}}catch{return {bestAverage:0,totalXp:0}} }
function saveProfile(profile){ localStorage.setItem(storageKey, JSON.stringify(profile)); renderProfile(); }
function loadLocalResults(){ try{return JSON.parse(localStorage.getItem(localResultsKey)||'[]')}catch{return []} }
function saveLocalResult(result){ const data=loadLocalResults(); data.unshift(result); localStorage.setItem(localResultsKey, JSON.stringify(data.slice(0,300))); }

function careerTitleByXp(xp){
  if(xp>=7000)return 'Instrutor ConCrédito';
  if(xp>=5500)return 'Supervisor de Atendimento';
  if(xp>=4200)return 'Especialista em Atendimento';
  if(xp>=3000)return 'Atendente Sênior';
  if(xp>=1800)return 'Atendente Pleno';
  if(xp>=900)return 'Atendente Júnior';
  if(xp>=300)return 'Atendente em Treinamento';
  return 'Aprendiz de Suporte';
}
function careerTitleByAverage(avg){
  if(avg>=100)return 'Instrutor ConCrédito';
  if(avg>=96)return 'Supervisor de Atendimento';
  if(avg>=90)return 'Especialista em Atendimento';
  if(avg>=80)return 'Atendente Sênior';
  if(avg>=70)return 'Atendente Pleno';
  if(avg>=55)return 'Atendente Júnior';
  if(avg>=40)return 'Atendente em Treinamento';
  return 'Aprendiz de Suporte';
}
function levelDescription(rank){
  const map={
    'Aprendiz de Suporte':'Primeiros passos no treinamento. Precisa praticar condução, clareza e próximo passo.',
    'Atendente em Treinamento':'Já demonstra noções básicas, mas ainda precisa evoluir nas objeções comerciais.',
    'Atendente Júnior':'Consegue responder parte dos casos, com pontos de melhoria em negociação e segurança.',
    'Atendente Pleno':'Boa condução na maioria dos casos, mantendo comunicação profissional.',
    'Atendente Sênior':'Ótimo desempenho comercial, com boa recuperação e segurança.',
    'Especialista em Atendimento':'Excelente domínio de comunicação, objeções e condução comercial.',
    'Supervisor de Atendimento':'Performance muito alta, com respostas próximas ao padrão de liderança.',
    'Instrutor ConCrédito':'Nível máximo. Demonstra domínio total e pode servir de referência para outros vendedores.'
  };
  return map[rank] || '';
}
function renderProfile(){
  const profile=loadProfile(); const title=careerTitleByXp(profile.totalXp||0);
  $('profileLevel').textContent=`Nível ${Math.max(1,Math.floor((profile.totalXp||0)/900)+1)}`;
  $('profileTitle').textContent=title; $('bestAverage').textContent=`${profile.bestAverage||0}%`; $('caseCount').textContent=caseBank.length;
  $('xpText').textContent=`${profile.totalXp||0} XP acumulado`; $('xpBar').style.width=`${Math.min(100,((profile.totalXp||0)%900)/9)}%`;
}
function updateIaStatus(){
  const real = !!analyzeUrl();
  $('iaStatus').textContent = real ? 'Gemini via backend' : 'IA local ativa';
  $('iaModeLabel').textContent = real ? 'Gemini' : 'Local';
}
function targetByDifficulty(){
  const diff=$('difficulty').value;
  if(diff==='junior') return 5;
  if(diff==='pleno') return 10;
  return 15;
}
function validateStart(){
  const name=$('sellerName').value.trim(); const team=$('sellerTeam').value;
  if(!name){ alert('Informe o nome do vendedor.'); return null; }
  if(!team){ alert('Selecione o time de vendas.'); return null; }
  return {name,team};
}
function resetSession(){
  clearInterval(state.timerId); clearInterval(state.queueTimer); state=freshState();
  $('timer').textContent='05:00'; $('timeBar').style.width='0%'; $('score').textContent='0'; $('solved').textContent='0'; $('xpHud').textContent='0';
  $('queueList').innerHTML=''; $('queueCount').textContent='0'; $('queueStatus').textContent='0 na fila'; $('attendance').classList.add('hidden'); $('emptyState').style.display='grid';
}
function startGame(){
  const seller=validateStart(); if(!seller)return;
  resetSession(); state.sellerName=seller.name; state.sellerTeam=seller.team; state.startedAt=new Date().toISOString();
  state.totalTime=parseInt($('gameTime').value,10); state.timeLeft=state.totalTime; state.targetCases=targetByDifficulty();
  $('timer').textContent=fmt(state.timeLeft); show(screens.game);
  for(let i=0;i<Math.min(4,state.targetCases);i++) addCase();
  state.timerId=setInterval(tick,1000); state.queueTimer=setInterval(()=>{ if(state.queue.length<4 && state.solved+state.queue.length<state.targetCases)addCase(); },9000);
}
function tick(){
  state.timeLeft--; $('timer').textContent=fmt(Math.max(0,state.timeLeft)); $('timeBar').style.width=`${100-((state.timeLeft/state.totalTime)*100)}%`;
  if(state.timeLeft<=0) finishGame();
}
function shuffledCases(){ return [...caseBank].sort(()=>Math.random()-.5); }
function addCase(){
  if(state.solved + state.queue.length >= state.targetCases) return;
  const used=new Set([...state.queue.map(c=>c.id), ...state.sessionHistory.map(h=>h.id)]);
  let base=shuffledCases().find(c=>!used.has(c.id)); if(!base) base=caseBank[Math.floor(Math.random()*caseBank.length)];
  if(!base) return; state.queue.push({...base, queueId:Date.now()+Math.random()}); renderQueue();
}
function renderQueue(){
  $('queueList').innerHTML=''; $('queueCount').textContent=state.queue.length; $('queueStatus').textContent=`${state.queue.length} na fila`;
  state.queue.forEach(item=>{ const div=document.createElement('div'); div.className='queue-item'+(state.activeCase?.queueId===item.queueId?' active':'');
    div.innerHTML=`<div class="queue-top"><strong>${item.name}</strong><span>${item.type}</span></div><p>${item.message}</p>`;
    div.onclick=()=>selectCase(item); $('queueList').appendChild(div); });
}
function selectCase(item){
  state.activeCase=item; state.historyOpened=false; $('emptyState').style.display='none'; $('attendance').classList.remove('hidden'); $('historyBox').classList.add('hidden'); $('supervisor').classList.add('hidden');
  $('agentAnswer').disabled=false; $('agentAnswer').value=''; $('sendBtn').disabled=false;
  $('clientName').textContent=item.name; $('clientType').textContent=item.type; $('clientProfile').textContent=item.profile||'Cliente'; $('avatar').textContent=(item.name||'C').slice(0,1).toUpperCase();
  $('historyList').innerHTML=''; (item.history||[]).forEach(h=>{ const div=document.createElement('div'); div.className='history-line'; div.innerHTML=`<span>${h[0]}</span><p>${h[1]}</p>`; $('historyList').appendChild(div); });
  renderChat([{role:'client',text:item.message}]); renderQueue();
}
function renderChat(messages){
  $('chatArea').innerHTML=''; messages.forEach(m=>{ const div=document.createElement('div'); div.className=`message ${m.role==='agent'?'agent':'client'}`; div.textContent=m.text; $('chatArea').appendChild(div); });
}
function keywordMatch(answer,c){
  const official=(c.official||[]); if(!official.length)return .3; const a=normalize(answer); return official.filter(k=>a.includes(normalize(k))).length/official.length;
}
function localEvaluate(answer){
  const c=state.activeCase; const a=answer||''; const wordCount=a.trim().split(/\s+/).filter(Boolean).length;
  if(wordCount<=4) return buildResult(18,18,15,22,20,12,['A resposta ficou curta demais para uma negociação real.','Inclua acolhimento, diagnóstico e próximo passo.'],[],c.suggested,c.type);
  const match=keywordMatch(a,c); const hasNext=hasAny(a,['posso','vou','vamos','verificar','consultar','faço','me envie','me confirme','qual','direcionar','encaminhar']);
  const hasEmpathy=hasAny(a,['entendo','compreendo','sem problemas','tranquilo','claro','tudo bem','à disposição','disposição']);
  const risky=[]; if(hasAny(a,['garanto','aprovado com certeza','com certeza vai cair','prometo','juros zero'])) risky.push('promessa');
  if(c.stage==='encaminhamento' && hasAny(a,['vou calcular','valor da quitação','boleto agora','desconto garantido'])) risky.push('procedimento de suporte');
  let context=55+match*35+(state.historyOpened?8:0); let diagnosis=50+match*40; let action=45+(hasNext?30:0)+match*20;
  let safety=risky.length?38:72+(match*18); let empathy=45+(hasEmpathy?30:0)+(wordCount>18?8:0); let commercial=45;
  if(hasAny(a,['nova simulação','simular novamente','melhores opções','alternativas','parcela confortável','orçamento','valor maior','qual período','retorno','comparar'])) commercial=88;
  if(c.stage==='encaminhamento' && hasAny(a,['direcionar','encaminhar','setor responsável','suporte'])) commercial=80;
  if(wordCount>=14 && hasNext && risky.length===0){ context=Math.max(context,70); diagnosis=Math.max(diagnosis,68); action=Math.max(action,72); safety=Math.max(safety,72); }
  const strengths=[]; if(match>.3)strengths.push('Você abordou pontos importantes do caso.'); if(hasNext)strengths.push('A resposta indicou um próximo passo.'); if(hasEmpathy)strengths.push('O tom foi humano e acolhedor.'); if(!risky.length)strengths.push('Você evitou promessas arriscadas.');
  const improvements=[]; if(!state.historyOpened)improvements.push('Abrir o histórico antes de responder ajuda a confirmar o contexto.'); if(match<.55)improvements.push('A resposta poderia ficar mais alinhada à condução recomendada.'); if(!hasNext)improvements.push('Inclua um próximo passo claro.'); if(!hasEmpathy)improvements.push('Humanize um pouco mais a abordagem.'); if(risky.length)improvements.push('Evite promessas ou procedimentos que não pertencem ao setor de vendas.');
  return buildResult(context,diagnosis,action,safety,empathy,commercial,improvements,strengths,c.suggested,c.type);
}
function buildResult(context,diagnosis,action,safety,empathy,commercial,improvements,strengths,suggested,caseType){
  const metrics={context:clamp(context),diagnosis:clamp(diagnosis),action:clamp(action),safety:clamp(safety),empathy:clamp(empathy),commercial:clamp(commercial)};
  const total=clamp(metrics.context*.16+metrics.diagnosis*.21+metrics.action*.24+metrics.safety*.15+metrics.empathy*.12+metrics.commercial*.12);
  return {total,metrics,feedback:titleFor(total),comment:commentFor(total,improvements,caseType),strengths:strengths.length?strengths:['A resposta foi analisada pelo contexto do caso.'],improvements:improvements.length?improvements:['Ótima condução. Mantenha clareza, segurança e tom humano.'],suggested};
}
function titleFor(total){ if(total>=90)return 'Excelente condução comercial'; if(total>=80)return 'Boa condução comercial'; if(total>=70)return 'Condução satisfatória'; if(total>=55)return 'Em desenvolvimento'; return 'Precisa melhorar'; }
function commentFor(total,imps,caseType){
  if(total>=90)return 'Resposta segura, humanizada e bem alinhada ao objetivo comercial do caso.';
  if(total>=80)return `Boa condução no caso de ${caseType||'vendas'}. Para ficar excelente, complemente com mais um detalhe da abordagem recomendada.`;
  if(total>=70)return `A resposta atende parte do objetivo, mas ainda pode explorar melhor a necessidade do cliente. ${imps[0]||''}`;
  if(total>=55)return `Existe uma base aproveitável, porém faltou condução comercial mais clara. ${imps[0]||''}`;
  return `A resposta ficou abaixo do esperado para uma negociação real. ${imps.slice(0,2).join(' ')}`;
}
async function evaluateAnswer(answer){
  const endpoint = analyzeUrl();
  if(endpoint){
    try{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:state.activeCase,answer,historyOpened:state.historyOpened,difficulty:$('difficulty').value,seller:{name:state.sellerName,team:state.sellerTeam}})});
      if(!res.ok)throw new Error('Backend indisponível'); const data=await res.json(); if(data && data.metrics)return data;
    }catch(err){ console.warn(err); }
  }
  return localEvaluate(answer);
}
function setMetric(name,value){ $(`m${name}`).textContent=`${value}%`; $(`bar${name}`).style.width=`${value}%`; }
function fillList(id,items){ const ul=$(id); ul.innerHTML=''; items.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; ul.appendChild(li); }); }
async function sendAnswer(){
  if(!state.activeCase)return; const answer=$('agentAnswer').value.trim(); if(!answer){alert('Digite uma resposta para o cliente.');return;}
  $('sendBtn').disabled=true; $('sendBtn').textContent='Analisando...'; renderChat([{role:'client',text:state.activeCase.message},{role:'agent',text:answer}]);
  const result=await evaluateAnswer(answer); $('sendBtn').textContent='Responder';
  const m=result.metrics; state.score+=result.total; state.solved++; state.responses++; const gained=Math.max(10,Math.round(result.total*1.4)); state.xp+=gained;
  Object.keys(state.totals).forEach(k=>state.totals[k]+=m[k]||0); $('score').textContent=state.score; $('solved').textContent=state.solved; $('xpHud').textContent=state.xp;
  setMetric('Context',m.context); setMetric('Diagnosis',m.diagnosis); setMetric('Action',m.action); setMetric('Safety',m.safety); setMetric('Empathy',m.empathy); setMetric('Commercial',m.commercial);
  $('feedbackTitle').textContent=result.feedback||titleFor(result.total); $('feedbackText').textContent=`Nota geral: ${result.total}%. XP ganho: ${gained}.`;
  fillList('strengthsList',result.strengths||[]); fillList('improvementsCaseList',result.improvements||[]); $('supervisorComment').textContent=result.comment||''; $('suggestedAnswer').textContent=result.suggested||state.activeCase.suggested;
  $('supervisor').classList.remove('hidden'); $('agentAnswer').disabled=true;
  state.sessionHistory.push({id:state.activeCase.id,case:state.activeCase.type,name:state.activeCase.name,clientMessage:state.activeCase.message,answer,total:result.total,feedback:result.feedback||titleFor(result.total),comment:result.comment||'',suggested:result.suggested||state.activeCase.suggested,metrics:m,strengths:result.strengths||[],improvements:result.improvements||[]});
  if(state.solved>=state.targetCases){ setTimeout(()=>finishGame(),700); }
}
function finishCase(){ if(!state.activeCase)return; state.queue=state.queue.filter(i=>i.queueId!==state.activeCase.queueId); state.activeCase=null; $('attendance').classList.add('hidden'); $('emptyState').style.display='grid'; renderQueue(); if(state.queue.length<4)addCase(); }
function buildFinalPayload(avg, rank, avgM){
  return { id:`treino_${Date.now()}_${Math.random().toString(16).slice(2)}`, seller_name:state.sellerName, seller_team:state.sellerTeam, created_at:new Date().toISOString(), started_at:state.startedAt, ended_at:state.endedAt, duration_seconds:state.totalTime-state.timeLeft, difficulty:$('difficulty').value, mode:$('trainingMode').value, target_cases:state.targetCases, solved:state.solved, score:state.score, average:avg, xp:state.xp, rank, metrics:avgM, cases:state.sessionHistory };
}
async function saveTrainingOnline(payload){
  const base=backendBase();
  if(!base) return {ok:false, message:'Resultado salvo localmente. Configure o backend no código para salvar online.'};
  try{
    const res=await fetch(`${base}/api/salvar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if(!res.ok) throw new Error(await res.text());
    return {ok:true,message:'Treinamento salvo online para o painel da gerente.'};
  }catch(e){ console.warn(e); return {ok:false,message:'Não foi possível salvar online. Resultado salvo localmente.'}; }
}
async function finishGame(){
  clearInterval(state.timerId); clearInterval(state.queueTimer); state.endedAt=new Date().toISOString(); const avg=state.responses?Math.round(state.score/state.responses):0; const profile=loadProfile(); profile.totalXp=(profile.totalXp||0)+state.xp; profile.bestAverage=Math.max(profile.bestAverage||0,avg); saveProfile(profile);
  const avgM={}; Object.keys(state.totals).forEach(k=>avgM[k]=state.responses?Math.round(state.totals[k]/state.responses):0); const rank=careerTitleByAverage(avg); const payload=buildFinalPayload(avg,rank,avgM); saveLocalResult(payload);
  $('finalSolved').textContent=state.solved; $('finalScore').textContent=state.score; $('finalAverage').textContent=`${avg}%`; $('finalXp').textContent=state.xp; $('certificateStatus').textContent=avg>=80&&state.solved>=5?'Aprovado':'Treinamento pendente'; $('finalRank').textContent=rank;
  $('summary').textContent=`${state.sellerName} (${state.sellerTeam}) concluiu ${state.solved} caso(s). ${levelDescription(rank)}`;
  $('reportText').textContent=`Contexto: ${avgM.context}%. Diagnóstico: ${avgM.diagnosis}%. Condução: ${avgM.action}%. Segurança: ${avgM.safety}%. Empatia: ${avgM.empathy}%. Recuperação comercial: ${avgM.commercial}%.`;
  const improvements=[]; if(avgM.context<70)improvements.push('Usar melhor o histórico antes de responder.'); if(avgM.diagnosis<70)improvements.push('Identificar com mais precisão a objeção ou necessidade do cliente.'); if(avgM.action<70)improvements.push('Conduzir melhor a negociação com pergunta, solução e próximo passo.'); if(avgM.safety<75)improvements.push('Evitar promessas absolutas e manter a abordagem comercial segura.'); if(avgM.empathy<75)improvements.push('Humanizar mais as respostas.'); if(!improvements.length)improvements.push('Excelente desempenho. Mantenha o padrão.'); fillList('improvementList',improvements);
  $('sessionHistory').innerHTML=''; state.sessionHistory.forEach(item=>{ const div=document.createElement('div'); div.className='session-line'; div.innerHTML=`<strong>${item.case} - ${item.total}%</strong><p>${item.feedback}</p><small><b>Resposta:</b> ${item.answer}</small>`; $('sessionHistory').appendChild(div); });
  renderRankingPreview(); $('saveStatus').textContent='Salvando resultado...'; show(screens.result); const save=await saveTrainingOnline(payload); $('saveStatus').textContent=save.message;
}
function renderRankingPreview(){
  const list=loadLocalResults().slice(0,25).sort((a,b)=>(b.average||0)-(a.average||0)).slice(0,5); $('rankingPreview').innerHTML='';
  list.forEach((r,i)=>{ const div=document.createElement('div'); div.className='session-line'; div.innerHTML=`<strong>${i+1}º ${r.seller_name} - ${r.average}%</strong><p>${r.seller_team} • ${r.rank}</p>`; $('rankingPreview').appendChild(div); });
}
function goHome(confirmPlay=true){ if(confirmPlay && screens.game.classList.contains('active') && state.timeLeft>0 && (state.solved||state.queue.length)){ if(!confirm('Deseja voltar ao menu principal? Seu progresso atual será perdido.'))return; } resetSession(); show(screens.start); }
function exportReport(){ const current=loadLocalResults()[0]; if(!current)return; const text=[`Relatório Academia de Vendas ConCrédito`, `Vendedor: ${current.seller_name}`, `Time: ${current.seller_team}`, `Média: ${current.average}%`, `Nível: ${current.rank}`, `XP: ${current.xp}`, '', ...current.cases.map(h=>`${h.case} - ${h.total}%\nCliente: ${h.clientMessage}\nResposta: ${h.answer}\nComentário: ${h.comment}\nResposta recomendada: ${h.suggested}\n`)].join('\n'); const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='relatorio_simulador_concredito.txt'; a.click(); URL.revokeObjectURL(a.href); }

$('startBtn').onclick=startGame; $('howBtn').onclick=()=>show(screens.how); $('backBtn').onclick=()=>show(screens.start); $('restartBtn').onclick=()=>goHome(false); $('brandHome').onclick=()=>goHome(true); $('endShiftBtn').onclick=finishGame; $('historyBtn').onclick=()=>{state.historyOpened=true;$('historyBox').classList.toggle('hidden')}; $('sendBtn').onclick=sendAnswer; $('finishCaseBtn').onclick=finishCase; $('hintBtn').onclick=()=>state.activeCase&&alert(state.activeCase.hint); $('exportBtn').onclick=exportReport; $('agentAnswer').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')sendAnswer();}); if($('adminBtn')) $('adminBtn').onclick=()=>{ location.href='admin.html'; };
renderProfile(); updateIaStatus();
