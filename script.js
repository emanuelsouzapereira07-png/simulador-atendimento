const $ = (id) => document.getElementById(id);
const screens = { start:$('startScreen'), how:$('howScreen'), config:$('configScreen'), game:$('gameScreen'), result:$('resultScreen') };
const caseBank = window.CONCREDITO_CASES || [];
const storageKey = 'central_concredito_vendas_v15';
const configKey = 'central_concredito_config_v15';

let state = { totalTime:300, timeLeft:300, timerId:null, queueTimer:null, queue:[], activeCase:null, historyOpened:false, score:0, solved:0, responses:0, xp:0, sessionHistory:[], totals:{context:0,diagnosis:0,action:0,safety:0,empathy:0,commercial:0} };
let appConfig = loadConfig();

function show(screen){ Object.values(screens).forEach(s=>s.classList.remove('active')); screen.classList.add('active'); }
function normalize(text){ return (text||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function tokens(text){ return normalize(text).split(/\s+/).filter(Boolean); }
function hasAny(text, terms){ const a=normalize(text); return terms.some(t=>a.includes(normalize(t))); }
function clamp(v,min=0,max=100){ return Math.max(min,Math.min(max,Math.round(v))); }
function fmt(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function loadConfig(){ try{return {...{backendUrl:'',useRealIa:false},...JSON.parse(localStorage.getItem(configKey)||'{}')}}catch{return {backendUrl:'',useRealIa:false}} }
function saveConfig(){ localStorage.setItem(configKey, JSON.stringify(appConfig)); updateIaStatus(); }
function loadProfile(){ try{return {bestAverage:0,totalXp:0,...JSON.parse(localStorage.getItem(storageKey)||'{}')}}catch{return {bestAverage:0,totalXp:0}} }
function saveProfile(profile){ localStorage.setItem(storageKey, JSON.stringify(profile)); renderProfile(); }


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
  if(avg>=98)return 'Instrutor ConCrédito';
  if(avg>=93)return 'Supervisor de Atendimento';
  if(avg>=88)return 'Especialista em Atendimento';
  if(avg>=82)return 'Atendente Sênior';
  if(avg>=75)return 'Atendente Pleno';
  if(avg>=65)return 'Atendente Júnior';
  if(avg>=50)return 'Atendente em Treinamento';
  return 'Aprendiz de Suporte';
}

function renderProfile(){
  const profile=loadProfile(); const level=Math.max(1,Math.floor(profile.totalXp/500)+1); const xpInLevel=profile.totalXp%500;
  $('profileLevel').textContent=`Nível ${level}`; $('profileTitle').textContent=careerTitleByXp(profile.totalXp);
  $('xpBar').style.width=`${(xpInLevel/500)*100}%`; $('xpText').textContent=`${profile.totalXp} XP acumulado`; $('bestAverage').textContent=`${profile.bestAverage||0}%`; $('caseCount').textContent=caseBank.length;
}
function updateIaStatus(){
  const real=appConfig.useRealIa && appConfig.backendUrl; $('iaStatus').textContent=real?'IA real conectada':'IA local ativa'; $('iaModeLabel').textContent=real?'Real':'Local';
  $('backendUrl').value=appConfig.backendUrl||''; $('useRealIa').checked=!!appConfig.useRealIa;
}
function resetSession(){
  clearInterval(state.timerId); clearInterval(state.queueTimer);
  state={...state,totalTime:Number($('gameTime').value||300),timeLeft:Number($('gameTime').value||300),timerId:null,queueTimer:null,queue:[],activeCase:null,historyOpened:false,score:0,solved:0,responses:0,xp:0,sessionHistory:[],totals:{context:0,diagnosis:0,action:0,safety:0,empathy:0,commercial:0}};
  $('timer').textContent=fmt(state.timeLeft); $('score').textContent='0'; $('solved').textContent='0'; $('xpHud').textContent='0'; $('queueCount').textContent='0'; $('queueStatus').textContent='0 na fila'; $('queueList').innerHTML=''; $('timeBar').style.width='100%';
  $('attendance').classList.add('hidden'); $('emptyState').style.display='grid';
}
function randomCase(){
  const diff=$('difficulty').value; const max={junior:1,pleno:2,senior:3,especialista:4}[diff]||2;
  const pool=caseBank.filter(c=>(c.difficulty||1)<=max); const base=(pool.length?pool:caseBank)[Math.floor(Math.random()*(pool.length?pool:caseBank).length)];
  return {...base,queueId:Date.now()+Math.random()};
}
function addCase(){ if(state.queue.length>=10||!caseBank.length)return; state.queue.push(randomCase()); renderQueue(); }
function renderQueue(){
  $('queueCount').textContent=state.queue.length; $('queueStatus').textContent=`${state.queue.length} na fila`; $('queueList').innerHTML='';
  state.queue.forEach(item=>{ const div=document.createElement('div'); div.className='queue-item'+(state.activeCase?.queueId===item.queueId?' active':''); div.innerHTML=`<div class="queue-top"><strong>${item.name}</strong><span>${item.type}</span></div><p>"${item.message}"</p>`; div.onclick=()=>openCase(item.queueId); $('queueList').appendChild(div); });
}
function openCase(id){
  state.activeCase=state.queue.find(i=>i.queueId===id); if(!state.activeCase)return; state.historyOpened=false;
  $('emptyState').style.display='none'; $('attendance').classList.remove('hidden'); $('historyBox').classList.add('hidden'); $('supervisor').classList.add('hidden'); $('agentAnswer').disabled=false; $('sendBtn').disabled=false; $('agentAnswer').value='';
  $('clientName').textContent=state.activeCase.name; $('clientType').textContent=state.activeCase.type; $('clientProfile').textContent=state.activeCase.profile||'Cliente'; $('avatar').textContent=state.activeCase.name[0].toUpperCase();
  $('historyList').innerHTML=''; state.activeCase.history.forEach(([label,text])=>{ const el=document.createElement('div'); el.className='history-line'; el.innerHTML=`<span>${label}</span><p>${text}</p>`; $('historyList').appendChild(el); });
  renderChat([{role:'client',text:state.activeCase.message}]); renderQueue();
}
function renderChat(messages){ $('chatArea').innerHTML=''; messages.forEach(m=>{ const div=document.createElement('div'); div.className=`message ${m.role}`; div.textContent=m.text; $('chatArea').appendChild(div); }); }
function startGame(){ resetSession(); show(screens.game); for(let i=0;i<5;i++)addCase(); state.timerId=setInterval(()=>{ state.timeLeft--; $('timer').textContent=fmt(state.timeLeft); $('timeBar').style.width=`${Math.max(0,(state.timeLeft/state.totalTime)*100)}%`; if(state.timeLeft<=0)finishGame(); },1000); const gap={junior:22000,pleno:16000,senior:12000,especialista:9000}[$('difficulty').value]||16000; state.queueTimer=setInterval(()=>{ if(state.timeLeft>0)addCase(); },gap); }

const riskTerms=['garanto','garantido','100%','aprovado com certeza','com certeza aprova','vai cair hoje','paga taxa','taxa para liberar','dash','não sei','nao sei','se vira','problema seu'];
const shortBad=['ok','s','sim','pode','vou ver','irei verificar','vou verificar','certo','ta','tá','blz'];
function localEvaluate(answer){
  const a=normalize(answer); const wordCount=tokens(answer).length; const c=state.activeCase; const official=c.official||[];
  const matched=official.filter(t=>hasAny(a,[t]));
  if(wordCount<4 || shortBad.includes(a.trim())) return buildResult(5,0,0,5,4,0,['Resposta curta demais. O cliente não entenderia o motivo, a solução nem o próximo passo.'],[],c.suggested);
  const hasGreeting=hasAny(a,['olá','ola','oi','bom dia','boa tarde','boa noite','tudo bem','claro','certo']);
  const hasEmpathy=hasAny(a,['entendo','compreendo','vou te ajudar','pode ficar tranquilo','fique tranquilo','não se preocupe','nao se preocupe','por favor']);
  const hasNext=hasAny(a,['vou','me envie','pode enviar','envie','responda','te retorno','já retorno','ja retorno','vou verificar','vou acompanhar','posso','vamos','clique','tente','faço essa troca','fazer a troca']);
  const risky=riskTerms.filter(t=>hasAny(a,[t]));

  const expectedByCase={
    parcelas_menores:[['entendo','sem problemas','compreendo'],['parcela','parcelas'],['confortavel','confortável','cabe no orçamento','orçamento'],['nova simulacao','nova simulação','simular novamente'],['melhores opcoes','melhores opções','opções disponíveis']],
    valor_maior:[['entendo','compreendo'],['verificar','consultar'],['valor maior','libere mais','maior valor'],['modalidade','outras modalidades'],['alternativas de credito','alternativas de crédito','outras opções']],
    vou_pensar:[['entendo','compreendo'],['duvida','dúvida'],['contratacao','contratação','proposta'],['nova simulacao','nova simulação'],['disposicao','disposição','te ajudar','ajudar']],
    interesse_inicial:[['carteira assinada','clt'],['simulacao','simulação'],['opcoes','opções'],['cpf'],['renda','salario','salário']],
    medo_golpe:[['entendo','compreendo'],['preocupacao','preocupação','seguranca','segurança'],['concredito','concrédito'],['dados'],['explicar','etapa','processo']],
    juros_altos:[['entendo','compreendo'],['juros','taxa','condição'],['revisar','verificar','nova simulacao','nova simulação'],['prazo','parcela','valor'],['opcao','opção']],
    concorrente:[['entendo','compreendo'],['condicao','condição','proposta'],['valor','parcela','prazo'],['comparar','verificar'],['alternativa','opcao','opção']],
    sumiu_whatsapp:[['duvida','dúvida'],['proposta'],['parcela','valor'],['nova simulacao','nova simulação'],['opcao','opção','sentido para você']],
    sem_tempo:[['sem problemas','tudo bem'],['outro horario','outro horário','te chamar'],['manha','manhã','tarde','noite','melhor horário']],
    quitacao_encaminhamento:[['quitacao antecipada','quitação antecipada','quitar'],['direcionar','encaminhar'],['setor responsavel','setor responsável','suporte'],['dar continuidade','continuidade'],['tudo bem']]
  };
  const groups=expectedByCase[c.id] || official.map(t=>[t]);
  const groupHits=groups.filter(group=>hasAny(a,group));
  let matchRatio=groups.length?groupHits.length/groups.length:(official.length?matched.length/official.length:0);

  let context=state.historyOpened?80:64; if(matchRatio>.25)context+=12; if(hasGreeting||hasEmpathy)context+=6;
  let diagnosis=38+(matchRatio*52); if(groupHits.length>=3)diagnosis+=8;
  let action=36+(matchRatio*42); if(hasNext)action+=16; if(hasEmpathy)action+=4;
  let safety=42+(matchRatio*32); if(hasNext)safety+=12; if(risky.length===0)safety+=16; safety-=risky.length*30;
  let empathy=45; if(hasGreeting)empathy+=18; if(hasEmpathy)empathy+=26; if(wordCount>18)empathy+=8;
  let commercial=45; if(hasAny(a,['nova simulação','simular novamente','verificar outra opção','alternativas','melhor condição','qual parcela','qual período','posso te chamar','posso verificar'])) commercial=90; else if(hasAny(a,['posso','gostaria','podemos','te ajudo','à disposição','disposição'])) commercial=74;

  // Ajuste: respostas úteis, com diagnóstico e próximo passo, não devem cair para nota muito baixa só por faltar um detalhe.
  const usefulMinimum = wordCount>=14 && hasNext && risky.length===0 && matchRatio>=0.35;
  if(usefulMinimum){ context=Math.max(context,72); diagnosis=Math.max(diagnosis,68); action=Math.max(action,70); safety=Math.max(safety,72); empathy=Math.max(empathy,58); }
  if(wordCount<10){ context-=8; diagnosis-=8; action-=12; safety-=10; empathy-=8; }
  if(risky.length){ safety=Math.min(safety,45); action=Math.min(action,60); }

  const strengths=[];
  if(groupHits.length)strengths.push('Você identificou parte importante do caso e não deixou o cliente sem retorno.');
  if(hasNext)strengths.push('A resposta trouxe uma ação prática para seguir o atendimento.');
  if(hasEmpathy)strengths.push('O tom foi acolhedor e transmitiu tranquilidade ao cliente.');
  if(wordCount>=14 && risky.length===0)strengths.push('A comunicação foi objetiva e sem promessas indevidas.');

  const improvements=[];
  if(!state.historyOpened)improvements.push('Uma melhoria seria abrir o histórico antes de responder, para confirmar todos os detalhes.');
  if(matchRatio<.55)improvements.push('Faltou explorar melhor a objeção ou incluir alguma orientação comercial importante.');
  if(!hasNext)improvements.push('Inclua um próximo passo claro para o cliente saber o que fazer.');
  if(!hasEmpathy)improvements.push('Você pode deixar a resposta um pouco mais humanizada, sem precisar escrever muito.');
  if(risky.length)improvements.push('Evite promessas absolutas, termos internos ou orientações inseguras.');
  return buildResult(context,diagnosis,action,safety,empathy,commercial,improvements,strengths,c.suggested, c.type);
}
function buildResult(context,diagnosis,action,safety,empathy,commercial,improvements,strengths,suggested,caseType){
  const metrics={context:clamp(context),diagnosis:clamp(diagnosis),action:clamp(action),safety:clamp(safety),empathy:clamp(empathy),commercial:clamp(commercial)};
  const total=clamp(metrics.context*.18+metrics.diagnosis*.25+metrics.action*.27+metrics.safety*.14+metrics.empathy*.10+metrics.commercial*.06);
  return {total,metrics,feedback: titleFor(total),comment: commentFor(total,improvements,caseType),strengths: strengths.length?strengths:['A resposta foi analisada pelo contexto do caso.'],improvements: improvements.length?improvements:['Ótima condução. Mantenha clareza, segurança e tom humano.'],suggested};
}
function titleFor(total){ if(total>=88)return 'Excelente venda'; if(total>=76)return 'Boa condução comercial'; if(total>=60)return 'Condução aceitável'; return 'Precisa melhorar'; }
function commentFor(total,imps,caseType){
  if(total>=88)return 'Resposta completa, segura e alinhada ao padrão esperado.';
  if(total>=76)return `Boa condução comercial no caso de ${caseType||'atendimento'}. Para ficar excelente, complemente com um detalhe do procedimento oficial e mantenha o próximo passo bem claro.`;
  if(total>=60)return `A resposta resolveu parte do atendimento, mas ainda pode ficar mais completa. ${imps.slice(0,1).join(' ')}`;
  return `A resposta ficou abaixo do ideal para treinamento. ${imps.slice(0,2).join(' ')}`;
}
async function evaluateAnswer(answer){
  if(appConfig.useRealIa && appConfig.backendUrl){
    try{
      const res=await fetch(appConfig.backendUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({case:state.activeCase,answer,historyOpened:state.historyOpened,difficulty:$('difficulty').value})});
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
  state.sessionHistory.push({case:state.activeCase.type,name:state.activeCase.name,answer,total:result.total,feedback:result.feedback||titleFor(result.total)});
}
function finishCase(){ if(!state.activeCase)return; state.queue=state.queue.filter(i=>i.queueId!==state.activeCase.queueId); state.activeCase=null; $('attendance').classList.add('hidden'); $('emptyState').style.display='grid'; renderQueue(); if(state.queue.length<4)addCase(); }
function finishGame(){
  clearInterval(state.timerId); clearInterval(state.queueTimer); const avg=state.responses?Math.round(state.score/state.responses):0; const profile=loadProfile(); profile.totalXp=(profile.totalXp||0)+state.xp; profile.bestAverage=Math.max(profile.bestAverage||0,avg); saveProfile(profile);
  $('finalSolved').textContent=state.solved; $('finalScore').textContent=state.score; $('finalAverage').textContent=`${avg}%`; $('finalXp').textContent=state.xp; $('certificateStatus').textContent=avg>=80&&state.solved>=5?'Aprovado':'Treinamento pendente';
  const rank=careerTitleByAverage(avg); $('finalRank').textContent=rank; $('summary').textContent=`Você atendeu ${state.solved} caso(s) durante o plantão.`;
  const avgM={}; Object.keys(state.totals).forEach(k=>avgM[k]=state.responses?Math.round(state.totals[k]/state.responses):0);
  $('reportText').textContent=`Contexto: ${avgM.context}%. Diagnóstico: ${avgM.diagnosis}%. Condução: ${avgM.action}%. Segurança: ${avgM.safety}%. Empatia: ${avgM.empathy}%. Recuperação comercial: ${avgM.commercial}%.`;
  const improvements=[]; if(avgM.context<70)improvements.push('Usar melhor o histórico antes de responder.'); if(avgM.diagnosis<70)improvements.push('Identificar com mais precisão a objeção ou necessidade do cliente.'); if(avgM.action<70)improvements.push('Conduzir melhor a negociação com pergunta, solução e próximo passo.'); if(avgM.safety<75)improvements.push('Evitar promessas absolutas e manter a abordagem comercial segura.'); if(avgM.empathy<75)improvements.push('Humanizar mais as respostas.'); if(!improvements.length)improvements.push('Excelente desempenho. Mantenha o padrão.'); fillList('improvementList',improvements);
  $('sessionHistory').innerHTML=''; state.sessionHistory.forEach(item=>{ const div=document.createElement('div'); div.className='session-line'; div.innerHTML=`<strong>${item.case} - ${item.total}%</strong><p>${item.feedback}</p><small>${item.answer}</small>`; $('sessionHistory').appendChild(div); });
  show(screens.result);
}
function goHome(confirmPlay=true){ if(confirmPlay && screens.game.classList.contains('active') && state.timeLeft>0 && (state.solved||state.queue.length)){ if(!confirm('Deseja voltar ao menu principal? Seu progresso atual será perdido.'))return; } resetSession(); show(screens.start); }
function exportReport(){ const text=[`Relatório Academia de Vendas ConCrédito`, `Atendidos: ${state.solved}`, `Pontos: ${state.score}`, `XP: ${state.xp}`, '', ...state.sessionHistory.map(h=>`${h.case} - ${h.total}%\nResposta: ${h.answer}\n`)].join('\n'); const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='relatorio_simulador_concredito.txt'; a.click(); URL.revokeObjectURL(a.href); }

$('startBtn').onclick=startGame; $('howBtn').onclick=()=>show(screens.how); $('backBtn').onclick=()=>show(screens.start); $('restartBtn').onclick=()=>goHome(false); $('brandHome').onclick=()=>goHome(true); $('endShiftBtn').onclick=finishGame; $('historyBtn').onclick=()=>{state.historyOpened=true;$('historyBox').classList.toggle('hidden')}; $('sendBtn').onclick=sendAnswer; $('finishCaseBtn').onclick=finishCase; $('hintBtn').onclick=()=>state.activeCase&&alert(state.activeCase.hint); $('openConfigBtn').onclick=()=>show(screens.config); $('configBackBtn').onclick=()=>show(screens.start); $('saveConfigBtn').onclick=()=>{appConfig.backendUrl=$('backendUrl').value.trim();appConfig.useRealIa=$('useRealIa').checked;saveConfig();alert('Configurações salvas.');}; $('exportBtn').onclick=exportReport; $('agentAnswer').addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter')sendAnswer();});
renderProfile(); updateIaStatus();
