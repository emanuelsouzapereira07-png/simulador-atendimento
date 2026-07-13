const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const KEYS = { cases:'cc_v16_cases', audits:'cc_v14_audits', notifications:'cc_v14_notifications', results:'cc_v14_results', xp:'cc_v14_xp', sounds:'cc_v14_sounds' };
const LEGACY_CASE_KEYS = ['cc_v14_cases','cc_v15_cases'];
const CASE_PASS = 'casos2026';
const MANAGER_PASS = 'gestor2026';
let selectedMode = 'plantao', activeCase = null, currentSession = null, timer = null;
let conversationTurns = 0;
let realistic = null;
let idleTimers = [];
let audioCtx = null;
let typingInterruptTimer = null;
const CLIENT_PERSONAS = [
  {id:'tranquilo', label:'Cliente tranquilo', emoji:'😊', mood:'tranquilo', trust:62, patience:82, interest:58, names:['Carlos','Mariana','Rafael'], style:'calmo'},
  {id:'nervoso', label:'Cliente nervoso', emoji:'😡', mood:'irritado', trust:28, patience:28, interest:50, names:['Marcos','Patrícia','André'], style:'caps'},
  {id:'desconfiado', label:'Cliente desconfiado', emoji:'🤨', mood:'desconfiado', trust:20, patience:55, interest:45, names:['Ana','Roberto','Suelen'], style:'desconfiado'},
  {id:'perdido', label:'Cliente perdido', emoji:'😕', mood:'confuso', trust:38, patience:62, interest:45, names:['João','Bruna','Paulo'], style:'confuso'},
  {id:'apressado', label:'Cliente impaciente', emoji:'⏱️', mood:'apressado', trust:42, patience:24, interest:55, names:['Lucas','Bianca','Felipe'], style:'curto'},
  {id:'whatsapp', label:'Cliente WhatsApp', emoji:'📱', mood:'informal', trust:46, patience:58, interest:48, names:['Dani','Gabi','Leandro'], style:'zap'},
  {id:'idoso', label:'Cliente idoso', emoji:'👵', mood:'inseguro', trust:40, patience:75, interest:42, names:['Dona Maria','Seu Antônio','Dona Célia'], style:'idoso'},
  {id:'desesperado', label:'Cliente desesperado', emoji:'😭', mood:'ansioso', trust:32, patience:35, interest:72, names:['Fernanda','Rodrigo','Aline'], style:'emocional'}
];
let gameRunId = 0; // controla sessões para evitar herdar estado/timeout de conversa antiga
function uid(prefix='id'){ return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function load(key, fallback=[]){ try{return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));}catch{return fallback;} }
function save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }

function normalizeDifficulty(value){
  const raw = String(value || '').trim().toLowerCase();
  if(['júnior','junior','facil','fácil','iniciante','baixo','baixa'].includes(raw)) return 'Júnior';
  if(['pleno','medio','médio','intermediario','intermediário','normal'].includes(raw)) return 'Pleno';
  if(['sênior','senior','dificil','difícil','avancado','avançado','alto','alta'].includes(raw)) return 'Sênior';
  return 'Pleno';
}
function normalizeModes(modes){
  const valid = ['plantao','conversa','treinamento'];
  if(!Array.isArray(modes) || !modes.length) return valid;
  const mapped = modes.map(m=>String(m||'').toLowerCase().trim()).map(m=>{
    if(['plantão','plantao','fila','tempo'].includes(m)) return 'plantao';
    if(['conversa','simulação realista','simulacao realista','realista','whatsapp'].includes(m)) return 'conversa';
    if(['treinamento','treino','livre'].includes(m)) return 'treinamento';
    return m;
  }).filter(m=>valid.includes(m));
  return mapped.length ? [...new Set(mapped)] : valid;
}
function normalizeCase(c){
  return {
    ...c,
    id: c.id || uid('caso'),
    status: (c.status || 'ativo').toLowerCase()==='inativo' ? 'inativo' : 'ativo',
    difficulty: normalizeDifficulty(c.difficulty || c.dificuldade),
    modes: normalizeModes(c.modes || c.modos),
    tags: Array.isArray(c.tags) ? c.tags : String(c.tags||'').split(/[|,]/).map(x=>x.trim()).filter(Boolean),
    history: Array.isArray(c.history) ? c.history : String(c.history||'').split('|').map(x=>x.trim()).filter(Boolean)
  };
}
function defaultCases(){ return (window.CONCREDITO_DEFAULT_CASES || []).map(normalizeCase); }
function getCases(){
  let stored=load(KEYS.cases,null);
  if(!stored){
    for(const k of LEGACY_CASE_KEYS){ stored = load(k,null); if(stored && stored.length) break; }
  }
  if(!stored || !Array.isArray(stored) || !stored.length){
    const defs=defaultCases(); save(KEYS.cases, defs); return defs;
  }
  const normalized=stored.map(normalizeCase);
  const defaultIds=new Set(defaultCases().map(c=>c.id));
  const existingIds=new Set(normalized.map(c=>c.id));
  const missingDefaults=defaultCases().filter(c=>!existingIds.has(c.id));
  const merged=[...normalized, ...missingDefaults];
  save(KEYS.cases, merged);
  return merged;
}

function setCases(cases){ save(KEYS.cases,(cases||[]).map(normalizeCase)); refreshAll(); }
function audit(action, title){ const items=load(KEYS.audits); items.unshift({id:uid('audit'), action, title, by:'Equipe', at:new Date().toISOString()}); save(KEYS.audits,items); }
function notify(title,message){ const items=load(KEYS.notifications); items.unshift({id:uid('not'), title, message, at:new Date().toISOString(), read:false}); save(KEYS.notifications,items); refreshNotifications(); }
function soundsEnabled(){ return localStorage.getItem(KEYS.sounds) !== 'off'; }
function playSound(type='msg'){
  if(!soundsEnabled()) return;
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const freq = type==='finish' ? 660 : type==='typing' ? 420 : 520;
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, audioCtx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.14);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.16);
  }catch(e){}
}
function clearIdleTimers(){ idleTimers.forEach(t=>clearTimeout(t)); idleTimers=[]; if(typingInterruptTimer){clearTimeout(typingInterruptTimer); typingInterruptTimer=null;} }
function scheduleIdlePrompts(){
  clearIdleTimers();
  if(selectedMode!=='conversa' || !realistic || realistic.closed) return;
  const runId = gameRunId;
  idleTimers.push(setTimeout(()=>{
    if(runId !== gameRunId || !realistic || realistic.closed || $('answerBox').value.trim()) return;
    addMsg('client','Ainda está aí?');
    realistic.patience=Math.max(0, realistic.patience-8);
    realistic.events.push('Demora na resposta fez o cliente perguntar se ainda havia atendimento.');
    realistic.lastClientAt=Date.now();
  },35000));
  idleTimers.push(setTimeout(()=>{
    if(runId !== gameRunId || !realistic || realistic.closed || $('answerBox').value.trim()) return;
    addMsg('client','Acho que caiu a conversa...');
    realistic.patience=Math.max(0, realistic.patience-16);
    realistic.trust=Math.max(0, realistic.trust-8);
    realistic.events.push('Demora prolongada reduziu a paciência e a confiança do cliente.');
    realistic.lastClientAt=Date.now();
  },70000));
}

function show(id){ $$('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0,0); }
function productOptions(includeAll=false){ return `${includeAll?'<option value="todos">Todos os produtos</option>':''}${window.CONCREDITO_PRODUCTS.map(p=>`<option>${p}</option>`).join('')}`; }
function fillSelects(){ ['caseProduct','casePanelProduct'].forEach(id=>$(id).innerHTML=productOptions(id!=='caseProduct')); $('caseCategory').innerHTML=window.CONCREDITO_CATEGORIES.map(x=>`<option>${x}</option>`).join(''); $('caseProfile').innerHTML=window.CONCREDITO_PROFILES.map(x=>`<option>${x}</option>`).join(''); }
function activeCases(){ return getCases().filter(c=>c.status!=='inativo'); }
function filteredCases(mode=selectedMode){ const diff=$('difficultyFilter').value; return activeCases().filter(c=>normalizeModes(c.modes).includes(mode) && (diff==='todos'||normalizeDifficulty(c.difficulty)===diff)); }
function caseCard(c, actions=false){ return `<div class="caseCard" data-id="${c.id}"><b>${c.title}</b><small>${c.product} • ${c.category} • ${c.difficulty} • ${c.profile}</small><p>${c.message}</p><div class="tags">${(c.tags||[]).slice(0,5).map(t=>`<span>${t}</span>`).join('')}<span>${c.status||'ativo'}</span></div>${actions?`<div class="actions"><button class="secondary small editCase" data-id="${c.id}">Editar</button><button class="secondary small dupCase" data-id="${c.id}">Duplicar</button><button class="secondary small toggleCase" data-id="${c.id}">${c.status==='inativo'?'Ativar':'Inativar'}</button><button class="secondary small delCase" data-id="${c.id}">Excluir</button></div>`:''}</div>`; }
function refreshHome(){ const results=load(KEYS.results); const xp=Number(localStorage.getItem(KEYS.xp)||0); const avg=results.length?Math.round(results.reduce((s,r)=>s+r.average,0)/results.length):0; $('homeTrainings').textContent=results.length; $('homeAvg').textContent=avg+'%'; $('homeCases').textContent=activeCases().length; $('xpText').textContent=`${xp} XP acumulado`; $('xpBar').style.width=Math.min(100,xp%100)+'%'; $('levelLabel').textContent='Nível '+(Math.floor(xp/100)+1); }
function refreshNotifications(){ const ns=load(KEYS.notifications); const unread=ns.filter(n=>!n.read).length; $('notificationCount').textContent=unread; $('homeNotifications').textContent=ns.length; $('notificationList').innerHTML=ns.slice(0,5).map(n=>`<div class="notice"><b>${n.title}</b><p>${n.message}</p><small>${new Date(n.at).toLocaleString('pt-BR')}</small></div>`).join('') || '<p>Nenhuma notificação.</p>'; }
function refreshCasePanel(){ const q=($('casePanelSearch').value||'').toLowerCase(), prod=$('casePanelProduct').value; const items=getCases().filter(c=>(prod==='todos'||c.product===prod) && JSON.stringify(c).toLowerCase().includes(q)); $('casePanelList').innerHTML=items.map(c=>caseCard(c,true)).join('') || '<p>Nenhum caso cadastrado.</p>'; bindCasePanelActions(); }
function refreshManager(){ const results=load(KEYS.results), cases=getCases(); const avg=results.length?Math.round(results.reduce((s,r)=>s+r.average,0)/results.length):0; const solved=results.reduce((s,r)=>s+(r.solved||0),0); $('managerCards').innerHTML=`<div><span>Treinamentos</span><b>${results.length}</b></div><div><span>Média geral</span><b>${avg}%</b></div><div><span>Casos ativos</span><b>${activeCases().length}</b></div><div><span>Atendimentos</span><b>${solved}</b></div>`;
 const bySeller={}; results.forEach(r=>{bySeller[r.name]=bySeller[r.name]||{count:0,avg:0,xp:0}; bySeller[r.name].count++; bySeller[r.name].avg+=r.average; bySeller[r.name].xp+=r.xp;}); $('rankingList').innerHTML=Object.entries(bySeller).sort((a,b)=>b[1].xp-a[1].xp).map(([n,v],i)=>`<div class="caseCard"><b>${i+1}º ${n}</b><small>${v.count} treinos • média ${Math.round(v.avg/v.count)}% • ${v.xp} XP</small></div>`).join('')||'<p>Sem resultados.</p>';
 $('resultsList').innerHTML=results.slice(0,10).map(r=>`<div class="caseCard"><b>${r.name}</b><small>${r.mode} • ${r.average}% • ${new Date(r.at).toLocaleString('pt-BR')}</small><p>${r.solved} caso(s) resolvido(s)</p></div>`).join('')||'<p>Sem treinos.</p>';
 const stats={}; results.flatMap(r=>r.cases||[]).forEach(c=>{stats[c.caseId]=stats[c.caseId]||{uses:0,total:0,time:0,errors:0}; stats[c.caseId].uses++; stats[c.caseId].total+=c.score; stats[c.caseId].time+=c.time||0; if(c.score<70)stats[c.caseId].errors++;}); $('caseStatsList').innerHTML=cases.map(c=>{const s=stats[c.id]||{uses:0,total:0,time:0,errors:0}; return `<div class="caseCard"><b>${c.title}</b><small>${c.product} • ${c.difficulty}</small><div class="finalGrid"><div><span>Usos</span><b>${s.uses}</b></div><div><span>Nota média</span><b>${s.uses?Math.round(s.total/s.uses):0}%</b></div><div><span>Erros</span><b>${s.errors}</b></div><div><span>Tempo médio</span><b>${s.uses?Math.round(s.time/s.uses):0}s</b></div></div></div>`;}).join('');
 $('auditList').innerHTML=load(KEYS.audits).map(a=>`<div class="caseCard"><b>${a.action}: ${a.title}</b><small>${a.by} • ${new Date(a.at).toLocaleString('pt-BR')}</small></div>`).join('')||'<p>Sem alterações.</p>'; $('managerNoticeList').innerHTML=load(KEYS.notifications).map(n=>`<div class="notice"><b>${n.title}</b><p>${n.message}</p><small>${new Date(n.at).toLocaleString('pt-BR')}</small></div>`).join('')||'<p>Sem notificações.</p>'; }
function refreshAll(){ refreshHome(); refreshNotifications(); refreshCasePanel(); refreshManager(); }
function startSession(){ const name=($('sellerName').value||'').trim(); if(!name){ alert('Informe seu nome para iniciar o treinamento.'); $('sellerName').focus(); return; } resetGameView(); const pool=filteredCases(selectedMode); if(!pool.length){ alert('Não há casos ativos para esse filtro.'); return;} currentSession={id:uid('sess'), mode:selectedMode, start:Date.now(), xp:0, solved:0, scores:[], cases:[]}; $('modeBadge').textContent=selectedMode==='plantao'?'Plantão':selectedMode==='conversa'?'Simulação Realista':'Treinamento'; $('gameTitle').textContent=$('modeBadge').textContent; show('gameScreen'); renderQueue(); if(selectedMode==='plantao') startTimer(Number($('shiftTime').value)); else {$('timerLabel').textContent='Livre'; clearInterval(timer);} updateHud(); }
function startTimer(sec){ clearInterval(timer); let left=sec; timer=setInterval(()=>{left--; $('timerLabel').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`; if(left<=0) finishSession();},1000); }
function renderQueue(){ const pool=filteredCases(selectedMode); let list=selectedMode==='plantao'?shuffle(pool).slice(0,6):pool; $('caseQueue').innerHTML=list.map(c=>caseCard(c)).join(''); $$('#caseQueue .caseCard').forEach(el=>el.onclick=()=>selectCase(el.dataset.id)); }
function shuffle(a){ return [...a].sort(()=>Math.random()-.5); }
function selectCase(id){
 clearIdleTimers();
 gameRunId++;
 activeCase={...getCases().find(c=>c.id===id)};
 activeCase._completed=false;
 conversationTurns=0;
 realistic= selectedMode==='conversa' ? createRealisticState(activeCase) : null;
 $('answerBox').value='';
 $('answerBox').disabled=false;
 $('answerBox').placeholder='Digite sua resposta como se estivesse atendendo o cliente...';
 $('sendAnswerBtn').disabled=false;
 $('supervisorBox').classList.add('hidden');
 const oldTyping=$('typingBubble'); if(oldTyping) oldTyping.remove();
 $('emptyService').classList.add('hidden');
 $('activeService').classList.remove('hidden');
 $('clientName').textContent=clientName(activeCase);
 $('clientAvatar').textContent=clientName(activeCase)[0];
 $('clientMeta').textContent= selectedMode==='conversa' ? `${activeCase.product} • ${activeCase.category} • Cliente inteligente ativo` : `${activeCase.product} • ${activeCase.category} • ${activeCase.profile}`;
 $('historyList').innerHTML=(activeCase.history||[]).map(h=>`<div class="historyLine">${h}</div>`).join('')||'<p>Sem histórico.</p>';
 if($('clientStatusBox')) $('clientStatusBox').innerHTML='';
 $('chatBox').innerHTML=`<div class="msg clientMsg">${selectedMode==='conversa'?adaptClientText(activeCase.message):activeCase.message}</div>`; updateClientStatus(); playSound('msg');
 $('answerBox').value='';
 $('supervisorBox').classList.add('hidden');
 $$('#caseQueue .caseCard').forEach(e=>e.classList.toggle('active',e.dataset.id===id));
 if(selectedMode==='conversa') scheduleIdlePrompts();
 setTimeout(()=>$('answerBox').focus(),50);
}
function clientName(c){ if(realistic && realistic.personaName) return realistic.personaName; const names={Educado:'Carlos',Indeciso:'João',Bravo:'Marcos',Desconfiado:'Ana',Apressado:'Bruna','Muito Questionador':'Roberto',Comunicativo:'Mariana','Responde pouco':'Paulo'}; return names[c.profile]||'Cliente'; }
function choosePersona(c){
 const forced={Bravo:'nervoso',Desconfiado:'desconfiado',Apressado:'apressado',Indeciso:'perdido','Responde pouco':'whatsapp','Muito Questionador':'desconfiado'};
 const preferred=CLIENT_PERSONAS.find(p=>p.id===forced[c.profile]);
 if(preferred && Math.random()<0.75) return preferred;
 return CLIENT_PERSONAS[Math.floor(Math.random()*CLIENT_PERSONAS.length)];
}
function adaptClientText(text){
 if(!realistic || !realistic.persona) return text;
 const st=realistic, style=st.persona.style;
 if(style==='caps') return text.toUpperCase().replace(/\.$/,'!!!');
 if(style==='zap') return text.replace(/Bom dia|Boa tarde|Olá|Ola/gi,'oi').replace(/você/gi,'vc').replace(/para/gi,'pra').replace(/estou/gi,'to');
 if(style==='curto') return text.length>90 ? text.split(/[.?!]/)[0]+'?' : text;
 if(style==='confuso') {
   const finalPositive=/(agora ficou|certo, entendi|tá certo|ta certo|pode me orientar|próximo passo|proximo passo|como seguimos|seguir|obrigado|vou avaliar|pode fazer|vamos seguir|quero continuar|pode continuar)/i.test(text);
   if(finalPositive) return text;
   return text + (text.includes('?')?'':' Não entendi direito.');
 }
 if(style==='idoso') return 'Meu filho, ' + text.charAt(0).toLowerCase() + text.slice(1);
 if(style==='emocional') return text + ' Preciso muito resolver isso.';
 return text;
}
function updateClientStatus(){
 if(!realistic) return;
 const st=realistic;
 const box=$('clientStatusBox');
 if(box){
   box.innerHTML=`<div><span>Humor</span><b>${st.persona?.emoji||'🙂'} ${st.mood}</b></div><div><span>Confiança</span><b>${Math.round(st.trust)}%</b></div><div><span>Paciência</span><b>${Math.round(st.patience)}%</b></div>`;
 }
}
function createRealisticState(c){
 const persona=choosePersona(c);
 const base={
   trust:persona.trust,
   patience:persona.patience,
   interest:persona.interest,
   mood:persona.mood,
   persona,
   personaName:persona.names[Math.floor(Math.random()*persona.names.length)],
   turns:0,
   closed:false,
   outcome:null,
   usedReplies:[],
   events:[`Cliente inteligente definido: ${persona.label}. O colaborador não vê esse perfil, apenas percebe pelo comportamento.`],
   bestAnswer:null,
   worstAnswer:null,
   bestScore:-1,
   worstScore:101,
   lastClientAt: Date.now(),
   resolvedTopics: [],
   turnAnalyses:[],
   memory:{cpf:null,banco:null,nome:null,contrato:null}
 };
 return base;
}
function evaluate(answer,c){
 const txt=answer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 const clean=answer.trim();
 const compact=txt.replace(/[^a-z0-9]/g,' ').replace(/\s+/g,' ').trim();
 const words=compact ? compact.split(' ').filter(Boolean) : [];
 const len=clean.length;
 const offensive=/(foda se|fodase|fdp|idiota|burro|caralho|porra|merda|vai se|pau no cu|tomar no cu|se vira|problema teu)/i.test(compact);
 const forbiddenShort=/^(idai|e dai|e dai|ok|sim|nao|não|n|s|ta bom|tá bom|blz|beleza|certo|👍|hum|aham|tanto faz)$/i.test(clean) || /^(idai|e dai|ok|sim|nao|n|s|blz|beleza|certo|aham|hum|tanto faz)$/i.test(compact);
 const veryShort=words.length<=2 || len<18;
 const badShort=forbiddenShort || words.length<=4 || len<35;
 const risky=/(garanto|garantido|100|com certeza aprova|vai cair hoje|cai hoje|paga taxa|taxa para liberar|dash|sistema interno|prometo|sem erro|certeza que cai)/i.test(compact);
 const insecure=/(nao sei|não sei|sei la|sei lá|nao tenho|não tenho|nao possui nada|não possui nada|infelizmente nao|infelizmente não|so aguardar|só aguardar|confia|relaxa|nao posso fazer nada|não posso fazer nada)/i.test(compact);
 const ignored=/^(como assim|nao entendi|não entendi|me chama depois|depois vemos|ve ai|vê aí)$/i.test(clean);
 const hasEmpathy=/(entendo|compreendo|sinto muito|vou te ajudar|sua preocupacao|sua preocupação|fica tranquilo|tranquilo|imagino|correto voce perguntar|correto você perguntar|faz sentido|entendi sua duvida|entendi sua dúvida)/i.test(txt);
 const hasSafety=/(contrato|canal oficial|sem taxa|nao cobramos taxa|não cobramos taxa|assinatura digital|certificado|cnpj|banco parceiro|acompanhar|cpf|verificar|comprovante|politica|política|site oficial|whatsapp oficial|meta verificado|empresa autorizada)/i.test(txt);
 const hasAction=/(posso|vamos|vou verificar|me envie|me informa|me confirma|proximo passo|próximo passo|seguir|simulacao|simulação|assinar|autorizar|te oriento|te explico|vou te explicar|para prosseguir|antes de seguir)/i.test(txt);
 const hasNegotiation=/(opcao|opção|condicao|condição|banco|analise|análise|taxa|valor|parcela|proposta|oportunidade|aprovacao|aprovação|melhor alternativa|comparar|ver outra opcao|ver outra opção)/i.test(txt);
 const hasQuestion=/\?$|\b(posso|pode|me confirma|qual|como|você prefere|voce prefere)\b/i.test(txt);
 let metrics={Empatia:100, Clareza:100, Segurança:100, Comercial:100, Negociação:100, Condução:100};
 const reasons={Empatia:[], Clareza:[], Segurança:[], Comercial:[], Negociação:[], Condução:[]};
 function penal(k,v,r){ metrics[k]=Math.max(0,metrics[k]-v); reasons[k].push(r); }
 function bonus(k,v){ metrics[k]=Math.min(100,metrics[k]+v); }
 if(offensive){
   Object.keys(metrics).forEach(k=>{metrics[k]=0; reasons[k].push('Uso de linguagem inadequada/ofensiva encerra a confiança do atendimento.');});
 } else if(forbiddenShort || ignored){
   Object.keys(metrics).forEach(k=>{metrics[k]=0; reasons[k].push('Resposta curta/inadequada não atende o cliente nem transmite profissionalismo.');});
 } else {
   if(veryShort){
     penal('Empatia',70,'Resposta curta demais, sem acolhimento.');
     penal('Clareza',75,'Não explicou a orientação de forma clara.');
     penal('Segurança',85,'Não transmitiu credibilidade nem domínio da informação.');
     penal('Comercial',80,'Não tentou recuperar ou conduzir o cliente.');
     penal('Negociação',80,'Não tratou a objeção apresentada.');
     penal('Condução',85,'Não indicou próximo passo.');
   } else if(badShort){
     penal('Empatia',45,'Resposta muito curta para o nível de dúvida do cliente.');
     penal('Clareza',45,'Explicação insuficiente.');
     penal('Segurança',55,'Faltaram informações que passassem confiança.');
     penal('Comercial',50,'Faltou condução comercial.');
     penal('Negociação',55,'Objeção pouco trabalhada.');
     penal('Condução',55,'Não direcionou bem o atendimento.');
   }
   if(!hasEmpathy){penal('Empatia',32,'Não acolheu a preocupação do cliente.');} else {bonus('Empatia',6);}
   if(!hasSafety){penal('Segurança',38,'Não apresentou elementos de credibilidade, segurança ou conferência.');} else {bonus('Segurança',8);}
   if(!hasAction){penal('Comercial',30,'Não propôs uma ação ou próximo passo.'); penal('Condução',28,'Faltou direcionamento prático.');} else {bonus('Comercial',6); bonus('Condução',6);}
   if(!hasNegotiation && (c.category==='Objeção' || /baixo|esperar|juros|parcela|valor|medo|golpe|cancelar/.test(txt))){penal('Negociação',32,'Não trabalhou a objeção principal.');}
   if(!hasQuestion){penal('Condução',14,'Não fechou com pergunta ou confirmação.');}
   if(risky){
     penal('Segurança',65,'Promessa, garantia ou termo interno prejudica a segurança do atendimento.');
     penal('Clareza',25,'Informação arriscada/confusa.');
     penal('Condução',20,'Condução baseada em promessa, não em orientação segura.');
   }
   if(insecure){
     penal('Segurança',80,'Resposta insegura ou sem domínio da informação.');
     penal('Clareza',30,'A orientação ficou vaga ou negativa.');
     penal('Empatia',20,'Passou insegurança ao cliente.');
     penal('Condução',35,'Não ofereceu alternativa segura.');
   }
   if(len>85) bonus('Clareza',5);
 }
 const total=Math.round(Object.values(metrics).reduce((a,b)=>a+b,0)/6);
 const feedback= total>=85?'Ótima condução. Você acolheu, explicou com segurança e indicou próximo passo.':total>=70?'Boa resposta, mas ainda pode conduzir com mais firmeza.':total>=50?'Resposta mediana. Faltou segurança, clareza ou próximo passo mais objetivo.':'Resposta fraca para treinamento. Faltou acolher, explicar corretamente e conduzir o cliente.';
 const improvements= offensive?'Nunca use linguagem ofensiva com o cliente. Isso encerra o atendimento e derruba totalmente a confiança.':forbiddenShort?'Respostas como “ok”, “idai”, “tanto faz” ou semelhantes zeram a segurança e a condução do atendimento.':risky?'Evite prometer aprovação, prazo ou usar termos internos.':insecure?'Não passe insegurança. Quando não souber, informe que vai verificar e conduza para uma ação segura.':badShort?'Evite respostas muito curtas. Explique, acolha e direcione.':'Procure fechar com uma pergunta ou próximo passo claro.';
 return {total, metrics, reasons, flags:{badShort,risky,insecure,offensive,forbiddenShort}, feedback, improvements};
}
function addMsg(kind,text){ const rendered=(kind==='client'&&selectedMode==='conversa')?adaptClientText(text):text; $('chatBox').insertAdjacentHTML('beforeend',`<div class="msg ${kind==='agent'?'agentMsg':'clientMsg'}">${rendered}</div>`); $('chatBox').scrollTop=$('chatBox').scrollHeight; if(kind==='client') playSound('msg'); updateClientStatus(); }
function showTyping(cb){ playSound('typing'); $('chatBox').insertAdjacentHTML('beforeend',`<div class="msg clientMsg typing" id="typingBubble"><span></span><span></span><span></span></div>`); $('chatBox').scrollTop=$('chatBox').scrollHeight; setTimeout(()=>{ const t=$('typingBubble'); if(t)t.remove(); cb(); }, 750+Math.random()*650); }

function captureMemory(answer){
 if(!realistic) return;
 const txt=answer;
 const cpf=txt.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
 if(cpf) realistic.memory.cpf=cpf[0];
 const banks=['nubank','caixa','itau','itaú','bradesco','santander','inter','sicredi','banrisul','picpay'];
 const bank=banks.find(b=>txt.toLowerCase().includes(b));
 if(bank) realistic.memory.banco=bank;
 const contract=txt.match(/\d{8,12}\/?[A-Z]{2,4}/i);
 if(contract) realistic.memory.contrato=contract[0];
}
function explainTurn(ev, answer){
 const entries=[];
 Object.entries(ev.reasons||{}).forEach(([k,arr])=>arr.slice(0,1).forEach(reason=>entries.push({metric:k, reason})));
 let alt='Entendo sua preocupação. Vou verificar com segurança e te explicar o próximo passo para resolvermos da melhor forma.';
 if((answer||'').length<35) alt='Entendo sua dúvida. Para te orientar com segurança, vou verificar as informações e já te explico o próximo passo, tudo bem?';
 if(ev.flags.risky) alt='Entendo. Eu não consigo prometer aprovação ou prazo sem verificar, mas posso consultar a situação e te orientar pelo caminho correto.';
 if(ev.flags.insecure) alt='Vou verificar essa informação com segurança antes de te passar qualquer orientação, para evitar erro no seu atendimento.';
 return {turn:realistic.turns+1, score:ev.total, answer, entries:entries.slice(0,3), alternative:alt};
}

function applyRealisticState(ev, answer){
 const st=realistic;
 st.turns++;
 captureMemory(answer);
 st.turnAnalyses.push(explainTurn(ev, answer));
 if(ev.total > st.bestScore){ st.bestScore=ev.total; st.bestAnswer=answer; }
 if(ev.total < st.worstScore){ st.worstScore=ev.total; st.worstAnswer=answer; }
 if(ev.flags.offensive){ st.trust=0; st.patience=0; st.interest=0; st.events.push('O atendimento usou linguagem ofensiva e o cliente perdeu totalmente a confiança.'); }
 else {
   if(ev.flags.badShort){st.trust-=18; st.patience-=16; st.events.push('Resposta muito curta reduziu a confiança do cliente.');}
   if(ev.flags.risky){st.trust-=26; st.patience-=10; st.events.push('Informação arriscada ou promessa forte deixou o cliente mais inseguro.');}
   if(ev.flags.insecure){st.trust-=30; st.interest-=14; st.events.push('Resposta insegura prejudicou a credibilidade do atendimento.');}
   if(ev.total>=85){st.trust+=20; st.interest+=13; st.patience+=4; st.events.push('Boa condução aumentou a confiança do cliente.');}
   else if(ev.total>=70){st.trust+=11; st.interest+=6; st.events.push('Resposta boa manteve o cliente engajado.');}
   else if(ev.total>=50){st.trust-=5; st.patience-=6; st.events.push('Resposta parcial deixou dúvidas em aberto.');}
   else {st.trust-=18; st.patience-=13; st.interest-=10; st.events.push('Resposta fraca fez o cliente cogitar desistir.');}
 }
 const delaySec = st.responseDelaySec || 0;
 if(delaySec>=70){ st.patience-=22; st.trust-=10; st.events.push('Resposta muito demorada prejudicou a experiência do cliente.'); }
 else if(delaySec>=35){ st.patience-=10; st.events.push('Tempo de resposta alto deixou o cliente menos paciente.'); }
 const txt=(answer||'').toLowerCase();
 const learnTopic=(topic,words)=>{ if(words.some(w=>txt.includes(w)) && ev.total>=65 && !st.resolvedTopics.includes(topic)) st.resolvedTopics.push(topic); };
 learnTopic('golpe',['golpe','confi','segur','cnpj','oficial','certificado','empresa','meta']);
 learnTopic('taxa',['taxa','cobran','antecipad','pagar antes']);
 learnTopic('contrato',['contrato','comprovante','assinatura','documento']);
 learnTopic('pagamento',['pagamento','cair','depósito','deposito','pix','prazo']);
 learnTopic('valor',['valor','liberad','taxa','banco','proposta','aumentar','menor']);
 st.trust=Math.max(0,Math.min(100,st.trust));
 st.patience=Math.max(0,Math.min(100,st.patience));
 st.interest=Math.max(0,Math.min(100,st.interest));
 st.mood = st.patience<=15?'irritado':st.trust>=82?'confiante':st.trust>=60?'mais seguro':st.trust>=35?'em dúvida':'desconfiado';
 updateClientStatus();
}
function pickReply(list){
 const st=realistic;
 const topicWords={
   golpe:['golpe','empresa certa','oficial','número de vocês','confiar'],
   taxa:['taxa','cobram','pagar antes'],
   contrato:['contrato','comprovante'],
   pagamento:['dinheiro não cair','pagamento','cair'],
   valor:['valor','libera mais','proposta melhor']
 };
 let available=list.filter(x=>!st.usedReplies.includes(x));
 available=available.filter(x=>!(st.resolvedTopics||[]).some(t=>(topicWords[t]||[]).some(w=>x.toLowerCase().includes(w))));
 if(!available.length) available=list.filter(x=>!st.usedReplies.includes(x));
 const chosen=(available.length?available:['Entendi. E qual seria o próximo passo agora?'])[0];
 st.usedReplies.push(chosen);
 return chosen;
}
function realisticClientReply(c,ev,answer){
 const st=realistic;
 if(st.closed) return {end:true, outcome:st.outcome||'encerrado', text:'Atendimento encerrado.'};
 if(ev.flags.offensive) return {end:true, outcome:'desistiu', text:'Nossa... desse jeito eu não vou continuar. Obrigado.'};
 if(st.trust<=8) return {end:true, outcome:'desistiu', text:'Olha, eu não me senti seguro para seguir. Vou deixar para depois.'};
 if(st.patience<=0 || st.patience<=8) return {end:true, outcome:'perdeu paciência', text:'Acho que essa conversa não vai resolver meu problema. Vou encerrar por aqui.'};
 if(st.turns>=3 && st.trust>=82 && st.interest>=55) return {end:true, outcome:'aceitou', text:'Agora ficou claro. Sim, pode seguir com a simulação/cadastro para mim.'};
 if(st.turns>=4 && st.trust>=70 && ev.total>=75) return {end:true, outcome:'aceitou', text:'Certo, entendi melhor. Quero seguir com a proposta, pode continuar.'};
 if(st.turns>=4 && st.trust<38) return {end:true, outcome:'pediu atendimento humano', text:'Pode me passar para alguém que consiga me explicar melhor? Ainda não fiquei seguro.'};
 if(st.turns>=3 && (st.resolvedTopics||[]).length>=2 && st.trust>=68){ return {end:true, outcome:'aceitou', text:'Agora ficou bem mais claro. Sim, vamos seguir com a simulação/cadastro.'}; }
 if(st.turns>=7) {
   if(st.trust>=60) return {end:true, outcome:'aceitou', text:'Tá certo, já consegui entender. Pode seguir com a proposta.'};
   return {end:true, outcome:'desistiu', text:'Vou pensar melhor e qualquer coisa volto depois.'};
 }
 if(ev.flags.badShort) return {text:pickReply(['Só isso? Eu ainda fiquei com dúvida. Pode me explicar melhor?','Mas assim ficou muito vago para mim. Pode detalhar melhor?','Não entendi direito. O que exatamente eu preciso fazer?'])};
 if(ev.flags.insecure) return {text:pickReply(['Mas aí eu fico mais inseguro ainda. Como vou confiar se a informação não ficou clara?','Entendi, mas eu preciso de uma orientação mais segura antes de seguir.','Se nem vocês conseguem confirmar isso, eu fico com receio de assinar.'])};
 if(ev.flags.risky) return {text:pickReply(['Você consegue mesmo garantir isso? Tenho medo de depois dar problema.','Mas se não acontecer desse jeito, como fica?','Prefiro que você me explique certinho, sem promessa, para eu entender.'])};
 if(st.persona?.id==='perdido' && st.turns>=2) return {text:pickReply(['Desculpa, me perdi um pouco. O que eu tenho que mandar mesmo?','Era CPF ou contrato que você precisava?','Não lembro se já passei meu banco. Precisa de novo?'])};
 if(st.persona?.id==='whatsapp') return {text: ev.total>=70?pickReply(['ta, e agr?','blz amiga, como faço?','entendi kkk e o próximo passo?']):pickReply(['n entendi','como assim?','moço??'])};
 if(st.persona?.id==='idoso') return {text:pickReply(['Meu filho, pode explicar mais simples?','Eu não mexo muito no celular. Como faço isso?','Quem fez isso foi meu filho, você consegue me orientar?'])};
 if(st.persona?.id==='desesperado') return {text: ev.total>=75?pickReply(['Tá, mas eu preciso resolver logo. O que faço agora?','Entendi, só estou bem preocupado. Qual o próximo passo?']):pickReply(['Eu preciso muito desse dinheiro, não consigo esperar sem entender.','Mas ninguém resolve isso para mim?'])};
 if(c.profile==='Desconfiado') return {text:pickReply(['Como eu confirmo que estou falando com a empresa certa?','Vocês cobram alguma taxa antes de liberar?','Tem contrato ou comprovante para eu acompanhar?','E se eu assinar e o dinheiro não cair, como fica?','O número de vocês é oficial mesmo?'])};
 if(c.profile==='Bravo') return {text: ev.total>=75 ? pickReply(['Tá, pelo menos agora você explicou melhor. Qual o prazo correto?','Certo, mas eu preciso de uma solução hoje. Qual o próximo passo?']) : pickReply(['Mas eu já escutei isso antes. Preciso de uma solução clara.','Você não está entendendo, eu preciso resolver isso agora.'])};
 if(c.profile==='Indeciso' || c.category==='Objeção') return {text: ev.total>=75 ? pickReply(['Entendi. Mas será que não vale esperar para ver se libera mais?','E se mês que vem aparecer uma proposta melhor?','Faz sentido, mas ainda estou em dúvida.']) : pickReply(['Mesmo assim acho que vou pensar mais um pouco.','Não sei... minha esposa falou para eu esperar.','Acho que não vou decidir agora.'])};
 if(c.profile==='Apressado') return {text: ev.total>=70?pickReply(['Certo, então me diga exatamente o que eu faço agora.','Beleza, qual é o próximo passo?']):pickReply(['Preciso resolver rápido. Qual é o próximo passo?','Você consegue ser mais direto? Estou com pressa.'])};
 if(c.profile==='Responde pouco') return {text: ev.total>=70?pickReply(['Tá, e agora?','Entendi.']):pickReply(['Não entendi.','Como assim?'])};
 return {text: ev.total>=75?pickReply(['Entendi melhor. Qual seria o próximo passo?','Tá, agora ficou mais claro. Como seguimos?']):pickReply(['Pode explicar de um jeito mais simples?','Ainda fiquei com dúvida.'])};
}
function buildSupervisor(ev, answer, outcome, finalScore){
 const st=realistic || {events:[],bestAnswer:answer,worstAnswer:answer,bestScore:ev.total,worstScore:ev.total};
 const resultLabel = outcome==='aceitou'?'🟢 Cliente convencido':outcome==='concluído'?'🟡 Atendimento concluído':outcome==='pediu atendimento humano'?'🟠 Cliente pediu outro atendimento':'🔴 Cliente desistiu';
 const timeline = (st.events||[]).slice(-6).map(e=>`<li>${e}</li>`).join('');
 const bars = Object.entries(ev.metrics).map(([k,v])=>{
   const why=(ev.reasons&&ev.reasons[k]&&ev.reasons[k][0])?`<small>${ev.reasons[k][0]}</small>`:'';
   return `<div class="metricLine"><span>${k}</span><div class="bar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}%</b>${why}</div>`;
 }).join('');
 const best = (st.bestScore>=65 && st.bestAnswer) ? st.bestAnswer : 'Nenhuma resposta atingiu um padrão satisfatório de atendimento.';
 const worst = st.worstAnswer || answer;
 const worstWhy = ev.flags.offensive ? 'Linguagem inadequada/ofensiva.' : ev.flags.forbiddenShort ? 'Resposta curta/inadequada que não acolheu, não explicou e não transmitiu segurança.' : ev.flags.badShort ? 'Resposta muito curta para a situação do cliente.' : 'Foi a resposta que mais reduziu a confiança do cliente.';
 const detailedErrors=(st.turnAnalyses||[]).map(t=>`<div class="caseCard"><b>Mensagem ${t.turn} • Nota ${t.score}%</b><p><b>Resposta:</b> ${t.answer}</p>${t.entries.length?`<ul>${t.entries.map(e=>`<li><b>${e.metric}:</b> ${e.reason}</li>`).join('')}</ul>`:'<p>Nenhum erro crítico nessa mensagem.</p>'}<p><b>Como poderia responder:</b> ${t.alternative}</p></div>`).join('');
 const memoryItems=Object.entries(st.memory||{}).filter(([,v])=>v).map(([k,v])=>`<span>${k}: ${v}</span>`).join('');
 return `<h3>Supervisor IA • Nota ${finalScore}%</h3>
 <p><b>Resultado:</b> ${resultLabel}</p>
 <p>${ev.feedback}</p>
 <div class="scoreBars">${bars}</div>
 <h3>Linha do tempo do atendimento</h3>
 <ul class="timeline">${timeline||'<li>Sem eventos suficientes.</li>'}</ul>
 <h3>Melhor resposta do colaborador</h3>
 <p>${best}</p>
 <h3>Resposta que mais prejudicou</h3>
 <p>${worst}</p>
 <p><b>Motivo:</b> ${worstWhy}</p>
 <h3>Erros explicados por mensagem</h3>
 <div class="cardsList compact">${detailedErrors||'<p>Nenhum detalhe registrado.</p>'}</div>
 <h3>Memória capturada da conversa</h3>
 <div class="tags">${memoryItems||'<span>Nenhum dado relevante mencionado</span>'}</div>
 <h3>Resposta ideal</h3>
 <p>${activeCase.ideal||'Sem resposta ideal cadastrada.'}</p>
 <p><b>Ponto de melhoria:</b> ${ev.improvements}</p>`;
}
function sendAnswer(){
 if(!activeCase)return;
 if(realistic && realistic.closed) return;
 if(selectedMode==='conversa') clearIdleTimers();
 const answer=$('answerBox').value.trim();
 if(answer.length<2){ v19ShowValidation('Digite uma resposta antes de enviar.'); return;}
 addMsg('agent',answer);
 const ev=evaluate(answer,activeCase);
 $('answerBox').value='';
 if(selectedMode==='conversa'){
   const runId = gameRunId;
   realistic.responseDelaySec = realistic.lastClientAt ? Math.round((Date.now()-realistic.lastClientAt)/1000) : 0;
   applyRealisticState(ev,answer);
   $('sendAnswerBtn').disabled=true;
   $('answerBox').disabled=true;
   showTyping(()=>{
     if(runId !== gameRunId || !activeCase || !realistic) return;
     const rep=realisticClientReply(activeCase,ev,answer);
     addMsg('client',rep.text);
     if(realistic) realistic.lastClientAt=Date.now();
     if(rep.end){
       realistic.closed=true;
       realistic.outcome=rep.outcome;
       setTimeout(()=>{
         if(runId !== gameRunId) return;
         $('supervisorBox').innerHTML='<h3>Supervisor IA analisando atendimento...</h3><p>Aguarde enquanto o atendimento é avaliado.</p>';
         $('supervisorBox').classList.remove('hidden');
       },1400);
       setTimeout(()=>{ if(runId === gameRunId) completeCase(ev,answer,rep.outcome); },2400);
     } else {
       $('sendAnswerBtn').disabled=false;
       $('answerBox').disabled=false;
       $('answerBox').focus();
       scheduleIdlePrompts();
     }
   });
   return;
 }
 completeCase(ev,answer);
}
function completeCase(ev,answer,outcome='concluído'){
 if(activeCase && activeCase._completed) return;
 if(activeCase) activeCase._completed=true;
 currentSession.solved++;
 let bonus=0;
 if(outcome==='aceitou') bonus=15;
 if(outcome==='concluído') bonus=5;
 if(outcome==='pediu atendimento humano') bonus=-12;
 if(outcome==='perdeu paciência') bonus=-18;
 if(outcome==='desistiu') bonus=-20;
 const finalScore=Math.max(0,Math.min(100,ev.total+bonus));
 currentSession.xp+=finalScore;
 currentSession.scores.push(finalScore);
 currentSession.cases.push({caseId:activeCase.id,title:activeCase.title,score:finalScore,answer,time:Math.round((Date.now()-currentSession.start)/1000),outcome});
 $('supervisorBox').innerHTML = selectedMode==='conversa' ? buildSupervisor(ev,answer,outcome,finalScore) : `<h3>Supervisor IA • Nota ${finalScore}%</h3><p><b>Desfecho:</b> ${outcome}.</p><p>${ev.feedback}</p><div class="scoreGrid">${Object.entries(ev.metrics).map(([k,v])=>`<div><span>${k}</span><b>${Math.round(v)}%</b></div>`).join('')}</div><h3>Resposta ideal</h3><p>${activeCase.ideal||'Sem resposta ideal cadastrada.'}</p><p><b>Ponto de melhoria:</b> ${ev.improvements}</p>`;
 $('supervisorBox').classList.remove('hidden');
 playSound('finish');
 if(selectedMode==='conversa'){
   $('sendAnswerBtn').disabled=true;
   $('answerBox').disabled=true;
   $('answerBox').placeholder='Atendimento encerrado. Clique em Novo para iniciar outro caso.';
 } else {
   $('sendAnswerBtn').disabled=false;
   $('answerBox').disabled=false;
 }
 updateHud();
}
function updateHud(){ if(!currentSession)return; const avg=currentSession.scores.length?Math.round(currentSession.scores.reduce((a,b)=>a+b,0)/currentSession.scores.length):0; $('xpLabel').textContent=currentSession.xp; $('avgLabel').textContent=avg+'%'; $('solvedLabel').textContent=currentSession.solved; }
function finishSession(){ if(!currentSession)return; const name=($('sellerName').value||'').trim(); if(!name){ alert('Informe seu nome para salvar o treinamento.'); $('sellerName').focus(); show('homeScreen'); return; } clearIdleTimers(); clearInterval(timer); const avg=currentSession.scores.length?Math.round(currentSession.scores.reduce((a,b)=>a+b,0)/currentSession.scores.length):0; const result={id:currentSession.id,name:name,team:$('sellerTeam').value,mode:$('modeBadge').textContent,average:avg,xp:currentSession.xp,solved:currentSession.solved,cases:currentSession.cases,at:new Date().toISOString()}; const results=load(KEYS.results); results.unshift(result); save(KEYS.results,results); localStorage.setItem(KEYS.xp,Number(localStorage.getItem(KEYS.xp)||0)+currentSession.xp); notify('Treinamento finalizado',`${result.name} finalizou ${result.mode} com média ${avg}%.`); currentSession=null; alert(`Sessão finalizada! Média: ${avg}%`); show('homeScreen'); refreshAll(); }
function fillForm(c){ $('caseId').value=c.id; $('caseTitle').value=c.title; $('caseProduct').value=c.product; $('caseCategory').value=c.category; $('caseDifficulty').value=c.difficulty; $('caseProfile').value=c.profile; $('caseStatus').value=c.status||'ativo'; $('caseTags').value=(c.tags||[]).join(', '); $('caseMessage').value=c.message||''; $('caseHistory').value=(c.history||[]).join('\n'); $('caseGoal').value=c.goal||''; $('caseIdeal').value=c.ideal||''; $('caseCriteria').value=c.criteria||''; $('caseHint').value=c.hint||''; $$('.modeCheck').forEach(ch=>ch.checked=(c.modes||[]).includes(ch.value)); window.scrollTo(0,0); }
function clearForm(){ $('caseForm').reset(); $('caseId').value=''; $$('.modeCheck').forEach(ch=>ch.checked=true); }
function bindCasePanelActions(){ $$('.editCase').forEach(b=>b.onclick=e=>{e.stopPropagation(); fillForm(getCases().find(c=>c.id===b.dataset.id));}); $$('.dupCase').forEach(b=>b.onclick=e=>{e.stopPropagation(); const c={...getCases().find(x=>x.id===b.dataset.id)}; c.id=uid('caso'); c.title+=' (cópia)'; const cases=getCases(); cases.unshift(c); setCases(cases); audit('Duplicou',c.title); notify('Caso duplicado',c.title);}); $$('.toggleCase').forEach(b=>b.onclick=e=>{e.stopPropagation(); const cases=getCases(); const c=cases.find(x=>x.id===b.dataset.id); c.status=c.status==='inativo'?'ativo':'inativo'; setCases(cases); audit(c.status==='ativo'?'Ativou':'Inativou',c.title);}); $$('.delCase').forEach(b=>b.onclick=e=>{e.stopPropagation(); if(!confirm('Excluir este caso?'))return; const cases=getCases(); const c=cases.find(x=>x.id===b.dataset.id); setCases(cases.filter(x=>x.id!==b.dataset.id)); audit('Excluiu',c?.title||b.dataset.id);}); }
function submitCase(e){ e.preventDefault(); const id=$('caseId').value||uid('caso'); const c={id,title:$('caseTitle').value,product:$('caseProduct').value,category:$('caseCategory').value,difficulty:$('caseDifficulty').value,profile:$('caseProfile').value,status:$('caseStatus').value,modes:$$('.modeCheck').filter(ch=>ch.checked).map(ch=>ch.value),tags:$('caseTags').value.split(',').map(x=>x.trim()).filter(Boolean),message:$('caseMessage').value,history:$('caseHistory').value.split('\n').map(x=>x.trim()).filter(Boolean),goal:$('caseGoal').value,ideal:$('caseIdeal').value,criteria:$('caseCriteria').value,hint:$('caseHint').value}; const cases=getCases(); const idx=cases.findIndex(x=>x.id===id); if(idx>=0){cases[idx]=c; audit('Editou',c.title);} else {cases.unshift(c); audit('Criou',c.title); notify('Novo caso cadastrado',c.title);} setCases(cases); clearForm(); }
function toCsv(rows){ if(!rows.length)return ''; const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))]; return [keys.join(';'),...rows.map(r=>keys.map(k=>`"${String(Array.isArray(r[k])?r[k].join('|'):r[k]??'').replace(/"/g,'""')}"`).join(';'))].join('\n'); }
function download(name,content,type='text/plain'){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
function parseCsv(text){ const lines=text.split(/\r?\n/).filter(Boolean); const headers=lines.shift().split(';').map(h=>h.replace(/^"|"$/g,'')); return lines.map(line=>{const vals=line.match(/("[^"]*(?:""[^"]*)*"|[^;]+)/g)||[]; const obj={}; headers.forEach((h,i)=>obj[h]=String(vals[i]||'').replace(/^"|"$/g,'').replace(/""/g,'"')); obj.id=obj.id||uid('caso'); obj.tags=String(obj.tags||'').split('|').filter(Boolean); obj.modes=String(obj.modes||'plantao|treinamento').split('|').filter(Boolean); obj.history=String(obj.history||'').split('|').filter(Boolean); return obj;}); }
function importCases(file){ const reader=new FileReader(); reader.onload=()=>{const txt=reader.result; let imported=[]; if(file.name.endsWith('.json')) imported=JSON.parse(txt); else imported=parseCsv(txt); const cases=[...imported,...getCases()]; setCases(cases); audit('Importou',`${imported.length} casos`); notify('Importação de casos',`${imported.length} casos foram importados.`);}; reader.readAsText(file); }
function resetGameView(){ gameRunId++; clearIdleTimers(); activeCase=null; realistic=null; conversationTurns=0; const t=$('typingBubble'); if(t)t.remove(); $('emptyService').classList.remove('hidden'); $('activeService').classList.add('hidden'); $('chatBox').innerHTML=''; $('answerBox').value=''; $('answerBox').disabled=false; $('answerBox').placeholder='Digite sua resposta como se estivesse atendendo o cliente...'; $('sendAnswerBtn').disabled=false; $('supervisorBox').innerHTML=''; $('supervisorBox').classList.add('hidden'); $$('#caseQueue .caseCard').forEach(e=>e.classList.remove('active')); }

function scheduleTypingInterrupt(){
 if(selectedMode!=='conversa' || !realistic || realistic.closed) return;
 if(typingInterruptTimer) clearTimeout(typingInterruptTimer);
 const runId=gameRunId;
 const wait=9000+Math.random()*9000;
 typingInterruptTimer=setTimeout(()=>{
   if(runId!==gameRunId || selectedMode!=='conversa' || !realistic || realistic.closed) return;
   if(($('answerBox').value||'').trim().length<12) return;
   const msgs=realistic.persona?.id==='nervoso' ? ['VOCÊ AINDA ESTÁ AÍ?','ALGUÉM VAI RESOLVER?','????'] : realistic.persona?.id==='apressado' ? ['consegue ver rápido?','tô com pressa','qual o próximo passo?'] : realistic.persona?.id==='whatsapp' ? ['moço?','ta ai?','??'] : ['Você ainda está verificando?','Pode me dar um retorno?','Ainda estou aguardando.'];
   addMsg('client', msgs[Math.floor(Math.random()*msgs.length)]);
   realistic.patience=Math.max(0, realistic.patience-7);
   realistic.events.push('Cliente interrompeu enquanto o colaborador digitava.');
   realistic.lastClientAt=Date.now();
   updateClientStatus();
 }, wait);
}

function initEvents(){ if($('soundToggle')){ $('soundToggle').checked=soundsEnabled(); $('soundToggle').onchange=()=>localStorage.setItem(KEYS.sounds,$('soundToggle').checked?'on':'off'); } $('goHome').onclick=()=>{resetGameView(); show('homeScreen');}; $('openHowToBtn').onclick=()=>show('howToScreen'); $('closeHowTo').onclick=()=>show('homeScreen'); $('openCasesPanel').onclick=()=>show('casePanelScreen'); $('openManagerPanel').onclick=()=>show('managerScreen'); $$('.mode').forEach(b=>b.onclick=()=>{$$('.mode').forEach(x=>x.classList.remove('activeMode')); b.classList.add('activeMode'); selectedMode=b.dataset.mode;}); $('startBtn').onclick=startSession; $('newRandomCase').onclick=()=>{ resetGameView(); renderQueue(); }; $('sendAnswerBtn').onclick=sendAnswer; $('hintBtn').onclick=()=>activeCase&&alert(activeCase.hint||'Sem dica cadastrada.'); $('finishBtn').onclick=finishSession; $('caseLoginBtn').onclick=()=>{ if($('casePassword').value===CASE_PASS){$('caseLogin').classList.add('hidden');$('casePanel').classList.remove('hidden');refreshCasePanel();}else alert('Senha incorreta.');}; $('managerLoginBtn').onclick=()=>{ if($('managerPassword').value===MANAGER_PASS){$('managerLogin').classList.add('hidden');$('managerPanel').classList.remove('hidden');refreshManager();}else alert('Senha incorreta.');}; $('caseLogoutBtn').onclick=()=>{$('casePanel').classList.add('hidden');$('caseLogin').classList.remove('hidden');}; $('managerLogoutBtn').onclick=()=>{$('managerPanel').classList.add('hidden');$('managerLogin').classList.remove('hidden');}; $('caseForm').onsubmit=submitCase; $('clearCaseForm').onclick=clearForm; ['casePanelSearch','casePanelProduct'].forEach(id=>$(id).oninput=refreshCasePanel); $('exportCasesJsonBtn').onclick=()=>download('casos_concredito.json',JSON.stringify(getCases(),null,2),'application/json'); $('exportCasesCsvBtn').onclick=()=>download('casos_concredito.csv',toCsv(getCases()),'text/csv'); $('importCasesBtn').onclick=()=>$('caseFileInput').click(); $('caseFileInput').onchange=e=>e.target.files[0]&&importCases(e.target.files[0]); $('exportResultsCsvBtn').onclick=()=>download('resultados_concredito.csv',toCsv(load(KEYS.results)),'text/csv'); $('noticeForm').onsubmit=e=>{e.preventDefault(); notify($('noticeTitle').value,$('noticeMessage').value); $('noticeForm').reset(); refreshManager();}; $('answerBox').addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendAnswer(); } }); $('answerBox').addEventListener('input',()=>scheduleTypingInterrupt()); $$('.tab').forEach(t=>t.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('activeTab')); t.classList.add('activeTab'); $$('.tabPanel').forEach(p=>p.classList.add('hidden')); $('manager'+t.dataset.tab[0].toUpperCase()+t.dataset.tab.slice(1)).classList.remove('hidden');}); $('notificationBtn').onclick=()=>{const ns=load(KEYS.notifications).map(n=>({...n,read:true})); save(KEYS.notifications,ns); refreshNotifications(); alert('Notificações marcadas como lidas.');}; }

/* =========================
   V17 - PLANTÃO REALISTA
   Status do atendente, fila dinâmica, clientes assíncronos,
   cobranças por demora, botão Encerrar atendimento e exclusão de histórico.
   ========================= */
const V17 = {
  live:false,
  status:'online',
  conversations:[],
  activeId:null,
  spawnTimer:null,
  tickTimer:null,
  shiftEndsAt:null,
  lastSpawn:0,
  statusSince:Date.now(),
  savedAtEnd:false
};
function v17DifficultyConfig(){
  const d=($('difficultyFilter')?.value||'Pleno');
  if(d==='Júnior') return {max:2, spawnMin:18000, spawnMax:32000, patienceFactor:1.25, replyMin:5000, replyMax:18000};
  if(d==='Sênior') return {max:6, spawnMin:6500, spawnMax:14000, patienceFactor:.70, replyMin:2500, replyMax:16000};
  return {max:4, spawnMin:10000, spawnMax:22000, patienceFactor:.95, replyMin:3500, replyMax:18000};
}
function v17Esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function v17Now(){ return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }
function v17EnsureUi(){
  if(!$('attendanceStatusWrap')){
    const hud=document.querySelector('.hud');
    if(hud){
      hud.insertAdjacentHTML('beforeend',`<div class="attendanceStatus" id="attendanceStatusWrap">
        <span>Atendimento:</span>
        <button class="statusBtn online" id="statusBtn">Online ●</button>
        <div class="statusMenu hidden" id="statusMenu">
          <button data-status="ausente"><i class="dot yellow"></i>Ausente</button>
          <button data-status="ocupado"><i class="dot red"></i>Ocupado</button>
          <button data-status="almoco"><i class="dot yellow"></i>Almoço</button>
          <button data-status="online"><i class="dot green"></i>Online</button>
        </div>
      </div>`);
    }
  }
  if(!$('closeConversationBtn')){
    const actions=document.querySelector('#activeService .actions');
    if(actions){ actions.insertAdjacentHTML('beforeend','<button class="secondary hidden" id="closeConversationBtn">Encerrar atendimento</button>'); }
  }
  if($('statusBtn')) $('statusBtn').onclick=()=> $('statusMenu')?.classList.toggle('hidden');
  $$('#statusMenu button').forEach(b=>b.onclick=()=>v17SetStatus(b.dataset.status));
  if($('closeConversationBtn')) $('closeConversationBtn').onclick=v17CloseActiveConversation;
}
function v17SetStatus(st){
  V17.status=st; V17.statusSince=Date.now();
  const labels={online:'Online',ocupado:'Ocupado',ausente:'Ausente',almoco:'Almoço'};
  const cls={online:'online',ocupado:'ocupado',ausente:'ausente',almoco:'ausente'};
  if($('statusBtn')){ $('statusBtn').className='statusBtn '+cls[st]; $('statusBtn').textContent=labels[st]+' ●'; }
  $('statusMenu')?.classList.add('hidden');
  notify('Status alterado',`Atendimento: ${labels[st]}.`);
}
function v17Pool(){
  const diff=$('difficultyFilter')?.value||'todos';
  return activeCases().filter(c=>{
    const modes=normalizeModes(c.modes);
    const okMode = modes.includes('conversa') || modes.includes('plantao');
    const okDiff = diff==='todos' || normalizeDifficulty(c.difficulty)===diff;
    return okMode && okDiff;
  });
}
function v17StartLiveShift(){
  v17EnsureUi();
  V17.live=true; V17.conversations=[]; V17.activeId=null; V17.savedAtEnd=false; V17.lastSpawn=0; V17.shiftEndsAt=Date.now()+Number($('shiftTime')?.value||300)*1000;
  v17SetStatus('online');
  $('timerLabel').textContent='--:--';
  $('caseQueue').innerHTML='<p class="hintText">Plantão iniciado. Novos clientes entrarão conforme seu status estiver Online.</p>';
  $('emptyService').classList.remove('hidden'); $('activeService').classList.add('hidden');
  clearInterval(timer); clearInterval(V17.tickTimer); clearTimeout(V17.spawnTimer);
  V17.tickTimer=setInterval(v17Tick,1000);
  v17ScheduleSpawn(1000);
  updateHud();
}
function v17StopLiveShift(){ clearTimeout(V17.spawnTimer); clearInterval(V17.tickTimer); V17.live=false; V17.conversations.forEach(c=>{clearTimeout(c.replyTimer); clearTimeout(c.nagTimer);}); }
function v17ScheduleSpawn(ms){ clearTimeout(V17.spawnTimer); V17.spawnTimer=setTimeout(v17MaybeSpawn,ms); }
function v17MaybeSpawn(){
  if(!V17.live || !currentSession) return;
  const cfg=v17DifficultyConfig();
  if(V17.status==='online' && V17.conversations.filter(c=>!c.closed).length<cfg.max){ v17AddCustomer(); }
  const next=cfg.spawnMin+Math.random()*(cfg.spawnMax-cfg.spawnMin);
  v17ScheduleSpawn(next);
}
function v17AddCustomer(){
  const pool=v17Pool(); if(!pool.length) return;
  const base={...pool[Math.floor(Math.random()*pool.length)]};
  const conv={
    id:uid('chat'), case:base, realistic:createRealisticState(base), messages:[], status:'awaiting_agent', unread:1,
    createdAt:Date.now(), lastClientAt:Date.now(), lastAgentAt:null, closed:false, awaitingClose:false,
    score:null, outcome:null, answerLog:[], replyTimer:null, nagTimer:null, botNoticeSent:false
  };
  const name=conv.realistic.personaName || clientName(base);
  conv.name=name;
  conv.messages.push({kind:'client', text:adaptClientText.call({} , base.message), at:Date.now()});
  V17.conversations.unshift(conv);
  notify('Novo cliente entrou',`${name} - ${base.product}`);
  playSound('msg');
  v17ScheduleNag(conv);
  v17RenderQueue();
}
function v17RenderQueue(){
  const active=V17.conversations.filter(c=>!c.closed);
  $('caseQueue').innerHTML = active.map(c=>{
    const wait = c.status==='awaiting_agent' ? Math.floor((Date.now()-c.lastClientAt)/1000) : 0;
    const badge = c.awaitingClose?'⚫': c.status==='awaiting_agent' ? (wait>90?'🔴':'🟡') : '🔵';
    const unread = c.unread?`<i class="unread">${c.unread}</i>`:'';
    const last = c.messages[c.messages.length-1]?.text || '';
    return `<div class="caseCard liveChat ${V17.activeId===c.id?'active':''} ${wait>90?'late':''}" data-id="${c.id}">
      ${unread}<b>${badge} ${v17Esc(c.name)}</b><small>${v17Esc(c.case.product)} • ${v17Esc(c.case.difficulty)} • ${new Date(c.lastClientAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small>
      <p>${v17Esc(last).slice(0,86)}</p><div class="tags"><span>${c.status==='awaiting_agent'?'Aguardando você':c.awaitingClose?'Pronto para encerrar':'Aguardando cliente'}</span>${wait?`<span>${wait}s</span>`:''}</div>
    </div>`;
  }).join('') || '<p class="hintText">Nenhum cliente ativo. Fique Online para receber novos clientes.</p>';
  $$('#caseQueue .liveChat').forEach(el=>el.onclick=()=>v17SelectConversation(el.dataset.id));
}
function v17SelectConversation(id){
  const conv=V17.conversations.find(c=>c.id===id); if(!conv) return;
  V17.activeId=id; activeCase=conv.case; realistic=conv.realistic; conv.unread=0;
  $('emptyService').classList.add('hidden'); $('activeService').classList.remove('hidden');
  $('clientName').textContent=conv.name; $('clientAvatar').textContent=conv.name[0]||'C';
  $('clientMeta').textContent=`${activeCase.product} • ${activeCase.category} • ${activeCase.difficulty}`;
  $('historyList').innerHTML=(activeCase.history||[]).map(h=>`<div class="historyLine">${v17Esc(h)}</div>`).join('')||'<p>Sem histórico.</p>';
  $('chatBox').innerHTML=conv.messages.map(m=>`<div class="msg ${m.kind==='agent'?'agentMsg':'clientMsg'}"><small>${new Date(m.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</small><br>${v17Esc(m.text)}</div>`).join('');
  $('answerBox').value=''; $('supervisorBox').classList.toggle('hidden',!conv.awaitingClose); if(conv.supervisorHtml) $('supervisorBox').innerHTML=conv.supervisorHtml;
  $('sendAnswerBtn').disabled=conv.awaitingClose || conv.status==='awaiting_client'; $('answerBox').disabled=conv.awaitingClose || conv.status==='awaiting_client';
  $('closeConversationBtn')?.classList.toggle('hidden',!conv.awaitingClose);
  updateClientStatus(); v17RenderQueue(); setTimeout(()=>$('answerBox')?.focus(),60);
}
function v17AddMessage(conv, kind, text){
  conv.messages.push({kind,text,at:Date.now()});
  if(kind==='client'){ conv.lastClientAt=Date.now(); conv.status='awaiting_agent'; if(V17.activeId!==conv.id) conv.unread++; notify(`${conv.name} enviou mensagem`,text.slice(0,70)); playSound('msg'); v17ScheduleNag(conv); }
  if(V17.activeId===conv.id){
    const oldActive=activeCase, oldReal=realistic; activeCase=conv.case; realistic=conv.realistic;
    $('chatBox').insertAdjacentHTML('beforeend',`<div class="msg ${kind==='agent'?'agentMsg':'clientMsg'}"><small>${v17Now()}</small><br>${v17Esc(text)}</div>`); $('chatBox').scrollTop=$('chatBox').scrollHeight; updateClientStatus(); activeCase=oldActive; realistic=oldReal;
  }
  v17RenderQueue();
}
function v17ScheduleNag(conv){
  clearTimeout(conv.nagTimer); if(conv.closed||conv.awaitingClose) return;
  const cfg=v17DifficultyConfig();
  const persona=conv.realistic.persona?.id||'tranquilo';
  const base = persona==='nervoso'?22000:persona==='apressado'?25000:persona==='desesperado'?28000:persona==='idoso'?65000:42000;
  conv.nagTimer=setTimeout(()=>{
    if(!V17.live || conv.closed || conv.awaitingClose || conv.status!=='awaiting_agent') return;
    const waited=Date.now()-conv.lastClientAt;
    if(V17.status==='ausente' || V17.status==='almoco'){
      if(!conv.botNoticeSent){ conv.botNoticeSent=true; const msg=V17.status==='almoco'?'Olá! Seu atendente está em horário de almoço no momento. Assim que retornar, continuará seu atendimento. Agradecemos pela compreensão.':'Olá! Seu atendente precisou se ausentar por alguns instantes, mas já já retorna para continuar seu atendimento. Agradecemos pela compreensão.'; v17AddMessage(conv,'agent','🤖 Bot: '+msg); }
      return;
    }
    const nags={
      nervoso:['TÁ AÍ???','Que demora no atendimento.','Vou cancelar então.','Ainda estou esperando uma solução.','Isso está demorando demais.'],
      apressado:['Consegue ver rápido?','Estou esperando.','Tem algum retorno?','Preciso resolver logo.','Pode me responder?'],
      whatsapp:['oi','??','moço?','ta ai?','conseguiu ver?','e aí?'],
      idoso:['Oi, ainda estou aguardando.','Você conseguiu verificar para mim?','Quando puder, me responde por favor.','Ainda estou aqui esperando.','Tudo bem por aí?','Conseguiu olhar para mim?'],
      desesperado:['Pelo amor de Deus, me ajuda.','Preciso resolver isso hoje.','Estou muito preocupado com isso.','Conseguiu ver meu caso?','Não posso ficar sem resposta.']
    };
    let arr=nags[persona]||['Oi, ainda estou aguardando.','Quando puder me responde, por favor.','Conseguiu verificar?','Tudo certo por aí?'];
    arr=arr.filter(x=>x!==conv.lastNagText);
    const msg=arr[Math.floor(Math.random()*arr.length)] || 'Oi, ainda estou aguardando.';
    conv.lastNagText=msg;
    conv.realistic.patience=Math.max(0,conv.realistic.patience-10);
    v17AddMessage(conv,'client',msg);
    if(waited>180000 && conv.realistic.patience<15){ v17CustomerAbandons(conv); } else v17ScheduleNag(conv);
  }, base*cfg.patienceFactor);
}
function v17CustomerAbandons(conv){
  if(conv.closed||conv.awaitingClose) return;
  v17AddMessage(conv,'client','Como não tive retorno, vou encerrar por aqui.');
  conv.awaitingClose=true; conv.outcome='desistiu por demora'; conv.score=25; conv.status='awaiting_close';
  currentSession.solved++; currentSession.scores.push(25); currentSession.xp+=25;
  currentSession.cases.push({caseId:conv.case.id,title:conv.case.title,score:25,answer:conv.answerLog.join(' | '),time:Math.round((Date.now()-conv.createdAt)/1000),outcome:conv.outcome});
  conv.supervisorHtml='<h3>Supervisor IA • Nota 25%</h3><p>O cliente abandonou por demora no retorno. Priorize clientes com indicador vermelho e use Ocupado/Ausente quando necessário.</p>';
  if(V17.activeId===conv.id) v17SelectConversation(conv.id);
  updateHud();
}
function v17SendAnswer(){
  const conv=V17.conversations.find(c=>c.id===V17.activeId); if(!conv) return;
  const answer=$('answerBox').value.trim(); if(answer.length<2){ v19ShowValidation('Digite uma resposta antes de enviar.'); return;}
  clearTimeout(conv.nagTimer); conv.status='awaiting_client'; conv.lastAgentAt=Date.now(); conv.botNoticeSent=false;
  const oldActive=activeCase, oldReal=realistic; activeCase=conv.case; realistic=conv.realistic;
  v17AddMessage(conv,'agent',answer); conv.answerLog.push(answer); $('answerBox').value='';
  const ev=evaluate(answer,conv.case); applyRealisticState(ev,answer);
  activeCase=oldActive; realistic=oldReal;
  $('sendAnswerBtn').disabled=true; $('answerBox').disabled=true;
  const cfg=v17DifficultyConfig(); const delay=cfg.replyMin+Math.random()*(cfg.replyMax-cfg.replyMin);
  clearTimeout(conv.replyTimer); conv.replyTimer=setTimeout(()=>{
    if(conv.closed||conv.awaitingClose) return;
    const oA=activeCase,oR=realistic; activeCase=conv.case; realistic=conv.realistic;
    const rep=realisticClientReply(conv.case,ev,answer);
    activeCase=oA; realistic=oR;
    v17AddMessage(conv,'client',rep.text);
    if(rep.end){ v17CompleteConversation(conv,ev,answer,rep.outcome); }
    if(V17.activeId===conv.id && !conv.awaitingClose){ $('sendAnswerBtn').disabled=false; $('answerBox').disabled=false; $('answerBox').focus(); }
  }, delay);
  
}
function v17CompleteConversation(conv,ev,answer,outcome='concluído'){
  if(conv.awaitingClose) return;
  conv.awaitingClose=true; conv.outcome=outcome; conv.status='awaiting_close'; clearTimeout(conv.nagTimer); clearTimeout(conv.replyTimer);
  let bonus=outcome==='aceitou'?15:outcome==='concluído'?5:outcome==='desistiu'?-20:0;
  const score=Math.max(0,Math.min(100,ev.total+bonus)); conv.score=score;
  currentSession.solved++; currentSession.scores.push(score); currentSession.xp+=score;
  currentSession.cases.push({caseId:conv.case.id,title:conv.case.title,score,answer:conv.answerLog.join(' | '),time:Math.round((Date.now()-conv.createdAt)/1000),outcome});
  const oA=activeCase,oR=realistic; activeCase=conv.case; realistic=conv.realistic;
  conv.supervisorHtml=buildSupervisor(ev,answer,outcome,score)+`<div class="finishPanel"><h3>Atendimento finalizado</h3><p>Cliente não enviará mais mensagens. Clique em <b>Encerrar atendimento</b> para remover da fila.</p></div>`;
  activeCase=oA; realistic=oR;
  if(V17.activeId===conv.id){ v17SelectConversation(conv.id); }
  updateHud(); playSound('finish');
}
function v17CloseActiveConversation(){
  const conv=V17.conversations.find(c=>c.id===V17.activeId); if(!conv||!conv.awaitingClose) return;
  conv.closed=true; clearTimeout(conv.nagTimer); clearTimeout(conv.replyTimer);
  V17.activeId=null; activeCase=null; realistic=null;
  $('emptyService').classList.remove('hidden'); $('activeService').classList.add('hidden');
  notify('Atendimento encerrado',`${conv.name} saiu da fila.`);
  v17RenderQueue(); updateHud();
}
function v17Tick(){
  if(!V17.live||!currentSession) return;
  const left=Math.max(0,Math.round((V17.shiftEndsAt-Date.now())/1000));
  $('timerLabel').textContent=`${String(Math.floor(left/60)).padStart(2,'0')}:${String(left%60).padStart(2,'0')}`;
  if(left<=0){ finishSession(); return; }
  v17RenderQueue();
}
const _oldFilteredCases = filteredCases;
filteredCases = function(mode=selectedMode){ if(mode==='conversa') return v17Pool(); return _oldFilteredCases(mode); };
const _oldStartSession = startSession;
startSession = function(){
  const name=($('sellerName').value||'').trim(); if(!name){ alert('Informe seu nome para iniciar o treinamento.'); $('sellerName').focus(); return; }
  resetGameView(); const pool=filteredCases(selectedMode); if(!pool.length){ alert('Não há casos ativos para esse filtro.'); return; }
  currentSession={id:uid('sess'), mode:selectedMode, start:Date.now(), xp:0, solved:0, scores:[], cases:[]};
  $('modeBadge').textContent=selectedMode==='plantao'?'Plantão':selectedMode==='conversa'?'Simulação Realista':'Treinamento'; $('gameTitle').textContent=$('modeBadge').textContent; show('gameScreen');
  if(selectedMode==='conversa'){ v17StartLiveShift(); } else { renderQueue(); if(selectedMode==='plantao') startTimer(Number($('shiftTime').value)); else {$('timerLabel').textContent='Livre'; clearInterval(timer);} updateHud(); }
};
const _oldRenderQueue = renderQueue;
renderQueue = function(){ if(selectedMode==='conversa'&&V17.live) return v17RenderQueue(); return _oldRenderQueue(); };
const _oldSendAnswer = sendAnswer;
sendAnswer = function(){ if(selectedMode==='conversa'&&V17.live) return v17SendAnswer(); return _oldSendAnswer(); };
const _oldFinishSession = finishSession;
finishSession = function(){
  if(selectedMode==='conversa'&&V17.live) v17StopLiveShift();
  return _oldFinishSession();
};

const _oldCompleteCaseV17 = completeCase;
completeCase = function(ev,answer,outcome='concluído'){
  _oldCompleteCaseV17(ev,answer,outcome);
  if(selectedMode!=='conversa'){
    if($('closeConversationBtn')){
      $('closeConversationBtn').classList.remove('hidden');
      $('closeConversationBtn').onclick=()=>{
        if(activeCase){ const el=document.querySelector(`#caseQueue .caseCard[data-id=\"${activeCase.id}\"]`); if(el) el.remove(); }
        activeCase=null; $('emptyService').classList.remove('hidden'); $('activeService').classList.add('hidden');
      };
    }
  }
};
const _oldResetGameView = resetGameView;
resetGameView = function(){ if(V17.live) v17StopLiveShift(); _oldResetGameView(); if($('closeConversationBtn')) $('closeConversationBtn').classList.add('hidden'); };
const _oldRefreshManager = refreshManager;
refreshManager = function(){
  _oldRefreshManager();
  const results=load(KEYS.results);
  const bySeller={}; results.forEach(r=>{bySeller[r.name]=bySeller[r.name]||{count:0,avg:0,xp:0}; bySeller[r.name].count++; bySeller[r.name].avg+=r.average; bySeller[r.name].xp+=r.xp;});
  if($('rankingList')) $('rankingList').innerHTML=Object.entries(bySeller).sort((a,b)=>b[1].xp-a[1].xp).map(([n,v],i)=>`<div class="caseCard"><b>${i+1}º ${v17Esc(n)}</b><small>${v.count} treinos • média ${Math.round(v.avg/v.count)}% • ${v.xp} XP</small><div class="actions"><button class="secondary small clearSellerHistory" data-name="${v17Esc(n)}">Excluir histórico</button></div></div>`).join('')||'<p>Sem resultados.</p>';
  $$('.clearSellerHistory').forEach(b=>b.onclick=()=>{ const name=b.dataset.name; if(!confirm(`Excluir todo o histórico de ${name}?`)) return; save(KEYS.results, load(KEYS.results).filter(r=>r.name!==name)); notify('Histórico excluído',`Histórico de ${name} foi removido.`); refreshAll(); });
};
v17EnsureUi();
if($('startBtn')) $('startBtn').onclick=startSession;
if($('sendAnswerBtn')) $('sendAnswerBtn').onclick=sendAnswer;
if($('finishBtn')) $('finishBtn').onclick=finishSession;
if($('answerBox')) $('answerBox').addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey && selectedMode==='conversa' && V17.live){ e.preventDefault(); v17SendAnswer(); } });

fillSelects(); clearForm(); initEvents(); refreshAll();
// Reaplica eventos sobrescritos pela V17 após a inicialização original
v17EnsureUi(); if($('startBtn')) $('startBtn').onclick=startSession; if($('sendAnswerBtn')) $('sendAnswerBtn').onclick=sendAnswer; if($('finishBtn')) $('finishBtn').onclick=finishSession; refreshAll();

/* =====================================================
   V18 - CORREÇÕES SOLICITADAS
   - IA menos genérica: resposta do cliente baseada na resposta do atendente
   - Remove central lateral de notificações (mantém toasts e contador)
   - Painel gestor com auditoria: clicar na pessoa, abrir histórico e conversa completa
   ===================================================== */
const V18 = { toastTimer:null };
function v18Rand(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function v18Text(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function v18EnsureToast(){
  if(!$('toastStack')) document.body.insertAdjacentHTML('beforeend','<div id="toastStack" class="toastStack"></div>');
}
function v18Toast(title,msg){
  v18EnsureToast();
  const id=uid('toast');
  $('toastStack').insertAdjacentHTML('beforeend',`<div class="toast" id="${id}"><b>${v17Esc(title)}</b><p>${v17Esc(msg)}</p></div>`);
  setTimeout(()=>$(id)?.remove(),4200);
}
// Notificações agora não ocupam a lateral; viram apenas contador + toast pequeno.
notify = function(title,message){
  const items=load(KEYS.notifications); items.unshift({id:uid('not'), title, message, at:new Date().toISOString(), read:false}); save(KEYS.notifications,items);
  refreshNotifications(); v18Toast(title,message);
};
refreshNotifications = function(){
  const ns=load(KEYS.notifications); const unread=ns.filter(n=>!n.read).length;
  if($('notificationCount')) $('notificationCount').textContent=unread;
  if($('homeNotifications')) $('homeNotifications').textContent=ns.length;
  if($('notificationList')) $('notificationList').innerHTML='<p class="hintText">As notificações aparecem no canto da tela e no contador do sino.</p>';
};
function v18AnalyzeAnswer(answer, c){
  const t=v18Text(answer), title=v18Text(c?.title), msg=v18Text(c?.message), ideal=v18Text(c?.ideal), all=title+' '+msg+' '+ideal;
  return {
    asksCpf:/\bcpf\b|documento|cadastro/.test(t),
    explainsReason:/porque|motivo|ocorre|acontece|devido|por conta|analise|politica|taxa|banco|dataprev|ctps|qi/.test(t),
    nextStep:/proximo passo|seguir|continuar|cadastro|simulacao|simular|assinar|autorizar|me confirma|me envie|vou verificar|posso verificar|vou consultar/.test(t),
    empathy:/entendo|compreendo|imagino|fica tranquilo|vou te ajudar|sua preocupacao|faz sentido|lamento|sinto muito/.test(t),
    security:/canal oficial|contrato|comprovante|sem taxa|nao cobramos|segur|cnpj|empresa|whatsapp oficial|verificar/.test(t),
    objectionValue:/valor|baixo|taxa|juros|oferta|proposta|liberad|esperar|garantir|condicao/.test(t),
    payment:/pagamento|pix|cair|deposito|conta|banco|chave/.test(t),
    reprovado:/reprovad|politica interna|restricao|analise interna|banco nao aprovou/.test(t),
    boleto:/boleto|parcela|mensalmente|demissao|saiu da empresa/.test(t),
    quitacao:/quitacao|quitar|liquidacao|antecipar|saldo devedor/.test(t),
    unsafe:/garanto|garantido|100%|certeza que cai|vai cair hoje|aprova com certeza|prometo/.test(t),
    vague:t.length<45 || /^(ok|certo|sim|nao|aguarde|so aguardar|vou ver|verifiquei)$/i.test(answer.trim()),
    topic: all.includes('valor')||all.includes('baixo')?'valor':all.includes('golpe')||all.includes('seguro')?'seguranca':all.includes('reprov')?'reprovado':all.includes('boleto')||all.includes('demissao')?'boleto':all.includes('quit')?'quitacao':all.includes('pagamento')||all.includes('pix')||all.includes('devolv')?'pagamento':'geral'
  };
}
function v18ClientReplyByAnswer(c, ev, answer){
  const st=realistic; const a=v18AnalyzeAnswer(answer,c); const persona=st?.persona?.id||'tranquilo';
  if(ev.flags.offensive) return {end:true,outcome:'desistiu',text:v18Rand(['Nossa... desse jeito eu não vou continuar.','Achei essa resposta bem inadequada. Vou encerrar por aqui.'])};
  if(a.unsafe) return {text:v18Rand(['Você consegue mesmo garantir isso? Tenho medo de depois dar problema.','Mas se não cair hoje como você falou, o que acontece?','Prefiro que você me explique sem promessa, para eu não me frustrar depois.'])};
  if(a.vague || ev.flags.badShort) return {text:v18Rand(['Não entendi direito. Pode me explicar melhor o que eu preciso fazer?','Ficou muito curto para mim. Qual é o próximo passo exatamente?','Ainda fiquei com dúvida, você pode detalhar melhor?'])};
  if(ev.flags.insecure) return {text:v18Rand(['Assim eu fico mais inseguro ainda. Você consegue verificar certinho antes de eu seguir?','Entendi, mas preciso de uma orientação mais segura.','Se a informação não está clara, prefiro não assinar ainda.'])};
  // Respostas específicas conforme o assunto e o que o atendente falou
  if(a.topic==='valor'){
    if(a.explainsReason && a.nextStep && a.empathy) return {end: st.turns>=2 || ev.total>=82, outcome:'aceitou', text:v18Rand(['Agora fez sentido. Se a condição pode mudar, pode seguir com a simulação/cadastro para mim.','Entendi melhor. Então vamos aproveitar essa condição e seguir.','Tá, agora ficou claro. Pode continuar comigo.'])};
    if(a.explainsReason && !a.nextStep) return {text:v18Rand(['Entendi o motivo, mas o que eu faço agora?','Certo, e para seguir eu preciso te mandar o quê?','Tá, mas você consegue continuar essa simulação comigo?'])};
    return {text:v18Rand(['Mas por que esse valor pode mudar?','Não entendi o que a taxa tem a ver com isso.','Será que não compensa esperar mais um pouco?'])};
  }
  if(a.topic==='seguranca'){
    if(a.security && a.nextStep) return {text:v18Rand(['Certo, ficando no canal oficial eu fico mais tranquilo. Qual dado você precisa para verificar?','Entendi. Então posso seguir por aqui mesmo?','Tá bom, e vocês não cobram nenhuma taxa antes, certo?'])};
    return {text:v18Rand(['Como eu sei que estou falando com a empresa certa?','Vocês cobram alguma taxa antes de liberar?','Tem algum contrato ou comprovante para acompanhar?'])};
  }
  if(a.topic==='pagamento'){
    if(a.payment && a.nextStep) return {text:v18Rand(['Certo. Vou te passar os dados para verificar o pagamento então.','Entendi. Você consegue conferir pelo meu CPF?','Tá, se foi devolvido, como faço para trocar a conta?'])};
    return {text:v18Rand(['Mas o dinheiro ainda não caiu. Como eu acompanho isso?','E se voltou o pagamento, o que eu preciso mandar?','Qual prazo real para resolver isso?'])};
  }
  if(a.topic==='reprovado'){
    if(a.reprovado && a.nextStep) return {text:v18Rand(['Entendi. Então tenta por outro banco para mim, por favor.','Tá, se esse banco não aprovou, podemos tentar outra opção?','Certo. Eu tenho chance em outro banco?'])};
    return {text:v18Rand(['Mas eu assinei o contrato, como foi reprovado?','Não entendi o motivo da reprovação.','Tem algo que eu possa fazer para tentar novamente?'])};
  }
  if(a.topic==='boleto'){
    if(a.boleto && a.nextStep) return {text:v18Rand(['Certo, então posso solicitar o boleto mensalmente com vocês.','Entendi. Quando vencer a próxima parcela eu chamo vocês.','Tá bom, obrigado por explicar.'])};
    return {text:v18Rand(['Como eu faço para pagar agora que saí da empresa?','Vai descontar da minha rescisão ou preciso pedir boleto?','Onde solicito esse boleto?'])};
  }
  if(a.topic==='quitacao'){
    if(a.quitacao && a.nextStep) return {text:v18Rand(['Entendi. Quero o boleto de quitação então.','Certo, pode solicitar o valor para mim?','Tá bom. E qual o prazo para baixa depois que eu pagar?'])};
    return {text:v18Rand(['Eu quero quitar tudo, não só antecipar parcela. Como faço?','Qual é a diferença entre quitar e antecipar?','Depois que pagar, quando dá baixa?'])};
  }
  if(a.empathy && a.explainsReason && a.nextStep && ev.total>=80) return {end:st.turns>=2, outcome:'aceitou', text:v18Rand(['Agora ficou claro. Pode seguir com o atendimento para mim.','Entendi, obrigado por explicar. Pode continuar.','Tá certo, vamos seguir então.'])};
  if(a.nextStep && ev.total>=70) return {text:v18Rand(['Certo, vou te mandar. Depois disso o que acontece?','Beleza. Qual informação você precisa primeiro?','Tá, e você consegue resolver por aqui mesmo?'])};
  if(!a.empathy && (persona==='nervoso'||persona==='desesperado')) return {text:v18Rand(['Você está sendo muito direto. Eu estou preocupado com isso.','Tá, mas eu preciso que alguém realmente me ajude.','Eu entendi, mas ainda estou nervoso com essa situação.'])};
  return {text:v18Rand(['Entendi melhor. Qual seria o próximo passo?','Tá, agora ficou mais claro. Como seguimos?','Certo. O que você precisa de mim agora?'])};
}
// Substitui o roteirizador antigo por uma resposta com análise da resposta dada.
realisticClientReply = function(c,ev,answer){
  const st=realistic;
  if(!st || st.closed) return {end:true,outcome:'encerrado',text:'Atendimento encerrado.'};
  if(st.trust<=8) return {end:true,outcome:'desistiu',text:v18Rand(['Olha, eu não me senti seguro para seguir. Vou deixar para depois.','Ainda não me passou segurança. Prefiro encerrar por enquanto.'])};
  if(st.patience<=8) return {end:true,outcome:'perdeu paciência',text:v18Rand(['Acho que essa conversa não vai resolver meu problema. Vou encerrar por aqui.','Demorou bastante e eu acabei perdendo a confiança. Vou deixar para depois.'])};
  const reply=v18ClientReplyByAnswer(c,ev,answer);
  if(reply.end) return reply;
  if(st.turns>=6){
    if(st.trust>=60 && ev.total>=70) return {end:true,outcome:'aceitou',text:v18Rand(['Tá certo, já consegui entender. Pode seguir com a proposta.','Agora ficou claro. Vamos seguir.'])};
    return {end:true,outcome:'desistiu',text:v18Rand(['Vou pensar melhor e qualquer coisa volto depois.','Ainda fiquei em dúvida, vou deixar para outro momento.'])};
  }
  return reply;
};

function v18TranscriptFromDom(){
  return $$('#chatBox .msg').map(m=>({kind:m.classList.contains('agentMsg')?'agent':'client', text:m.innerText.replace(/^\d{2}:\d{2}\s*/,'').trim(), at:new Date().toISOString()}));
}
function v18CaseDetailPayload(extra={}){
  const st=realistic;
  return {
    conversation: extra.conversation || v18TranscriptFromDom(),
    analyses: st?.turnAnalyses || [],
    events: st?.events || [],
    memory: st?.memory || {},
    supervisorHtml: $('supervisorBox')?.innerHTML || extra.supervisorHtml || '',
    caseData: activeCase ? {...activeCase} : extra.caseData,
    outcome: extra.outcome,
    startedAt: extra.startedAt || currentSession?.start || Date.now(),
    finishedAt: Date.now()
  };
}
// Reescreve conclusão de caso normal para salvar conversa completa.
completeCase = function(ev,answer,outcome='concluído'){
 if(activeCase && activeCase._completed) return;
 if(activeCase) activeCase._completed=true;
 currentSession.solved++;
 let bonus=0; if(outcome==='aceitou') bonus=15; if(outcome==='concluído') bonus=5; if(outcome==='pediu atendimento humano') bonus=-12; if(outcome==='perdeu paciência') bonus=-18; if(outcome==='desistiu') bonus=-20;
 const finalScore=Math.max(0,Math.min(100,ev.total+bonus)); currentSession.xp+=finalScore; currentSession.scores.push(finalScore);
 const supervisor = selectedMode==='conversa' ? buildSupervisor(ev,answer,outcome,finalScore) : `<h3>Supervisor IA • Nota ${finalScore}%</h3><p><b>Desfecho:</b> ${outcome}.</p><p>${ev.feedback}</p><div class="scoreGrid">${Object.entries(ev.metrics).map(([k,v])=>`<div><span>${k}</span><b>${Math.round(v)}%</b></div>`).join('')}</div><h3>Resposta ideal</h3><p>${activeCase.ideal||'Sem resposta ideal cadastrada.'}</p><p><b>Ponto de melhoria:</b> ${ev.improvements}</p>`;
 $('supervisorBox').innerHTML=supervisor; $('supervisorBox').classList.remove('hidden');
 currentSession.cases.push({caseId:activeCase.id,title:activeCase.title,score:finalScore,answer,time:Math.round((Date.now()-currentSession.start)/1000),outcome,...v18CaseDetailPayload({outcome,supervisorHtml:supervisor})});
 playSound('finish');
 if(selectedMode==='conversa'){ $('sendAnswerBtn').disabled=true; $('answerBox').disabled=true; $('answerBox').placeholder='Atendimento finalizado. Clique em Encerrar atendimento.'; }
 else { $('sendAnswerBtn').disabled=false; $('answerBox').disabled=false; }
 if($('closeConversationBtn')){ $('closeConversationBtn').classList.remove('hidden'); $('closeConversationBtn').onclick=()=>{ if(activeCase){ const el=document.querySelector(`#caseQueue .caseCard[data-id="${activeCase.id}"]`); if(el) el.remove(); } activeCase=null; $('emptyService').classList.remove('hidden'); $('activeService').classList.add('hidden'); }; }
 updateHud();
};
// V17: salva cada conversa realista completa no histórico.
v17CompleteConversation = function(conv,ev,answer,outcome='concluído'){
  if(conv.awaitingClose) return;
  conv.awaitingClose=true; conv.outcome=outcome; conv.status='awaiting_close'; clearTimeout(conv.nagTimer); clearTimeout(conv.replyTimer);
  let bonus=outcome==='aceitou'?15:outcome==='concluído'?5:outcome==='desistiu'?-20:0;
  const score=Math.max(0,Math.min(100,ev.total+bonus)); conv.score=score;
  currentSession.solved++; currentSession.scores.push(score); currentSession.xp+=score;
  const oA=activeCase,oR=realistic; activeCase=conv.case; realistic=conv.realistic;
  conv.supervisorHtml=buildSupervisor(ev,answer,outcome,score)+`<div class="finishPanel"><h3>Atendimento finalizado</h3><p>Cliente não enviará mais mensagens. Clique em <b>Encerrar atendimento</b> para remover da fila.</p></div>`;
  currentSession.cases.push({caseId:conv.case.id,title:conv.case.title,score,answer:conv.answerLog.join(' | '),time:Math.round((Date.now()-conv.createdAt)/1000),outcome,conversation:conv.messages,analyses:conv.realistic.turnAnalyses||[],events:conv.realistic.events||[],memory:conv.realistic.memory||{},supervisorHtml:conv.supervisorHtml,caseData:{...conv.case},startedAt:conv.createdAt,finishedAt:Date.now(),clientName:conv.name});
  activeCase=oA; realistic=oR;
  if(V17.activeId===conv.id){ v17SelectConversation(conv.id); }
  updateHud(); playSound('finish');
};
v17CustomerAbandons = function(conv){
  if(conv.closed||conv.awaitingClose) return;
  v17AddMessage(conv,'client','Como não tive retorno, vou encerrar por aqui.');
  conv.awaitingClose=true; conv.outcome='desistiu por demora'; conv.score=25; conv.status='awaiting_close';
  currentSession.solved++; currentSession.scores.push(25); currentSession.xp+=25;
  conv.supervisorHtml='<h3>Supervisor IA • Nota 25%</h3><p>O cliente abandonou por demora no retorno. Priorize clientes com indicador vermelho e use Ocupado/Ausente quando necessário.</p>';
  currentSession.cases.push({caseId:conv.case.id,title:conv.case.title,score:25,answer:conv.answerLog.join(' | '),time:Math.round((Date.now()-conv.createdAt)/1000),outcome:conv.outcome,conversation:conv.messages,analyses:conv.realistic.turnAnalyses||[],events:conv.realistic.events||[],memory:conv.realistic.memory||{},supervisorHtml:conv.supervisorHtml,caseData:{...conv.case},startedAt:conv.createdAt,finishedAt:Date.now(),clientName:conv.name});
  if(V17.activeId===conv.id) v17SelectConversation(conv.id);
  updateHud();
};
function v18EnsureManagerModal(){
  if(!$('managerAuditModal')) document.body.insertAdjacentHTML('beforeend',`<div class="modalOverlay hidden" id="managerAuditModal"><div class="modalCard"><div class="panelTitle"><div><span class="badge">Auditoria do Gestor</span><h2 id="modalTitle">Histórico</h2></div><button class="secondary" id="closeAuditModal">Fechar</button></div><div id="modalBody"></div></div></div>`);
  $('closeAuditModal').onclick=()=>$('managerAuditModal').classList.add('hidden');
}
function v18OpenSeller(name){
  v18EnsureManagerModal();
  const rows=load(KEYS.results).filter(r=>r.name===name);
  $('modalTitle').textContent=`Histórico de ${name}`;
  $('modalBody').innerHTML=`<div class="cardsList">${rows.map(r=>`<div class="caseCard"><b>${v17Esc(r.mode)} • ${r.average}%</b><small>${new Date(r.at).toLocaleString('pt-BR')} • ${r.solved||0} caso(s) • ${r.xp||0} XP</small><p>${v17Esc(r.team||'')}</p><div class="actions"><button class="primary small openTraining" data-id="${r.id}">Abrir treinamento</button><button class="secondary small deleteTraining" data-id="${r.id}">Excluir treinamento</button></div></div>`).join('')||'<p>Nenhum treinamento encontrado.</p>'}</div>`;
  $$('.openTraining').forEach(b=>b.onclick=()=>v18OpenTraining(b.dataset.id));
  $$('.deleteTraining').forEach(b=>b.onclick=()=>{ if(!confirm('Excluir apenas este treinamento?')) return; save(KEYS.results,load(KEYS.results).filter(r=>r.id!==b.dataset.id)); refreshAll(); v18OpenSeller(name); });
  $('managerAuditModal').classList.remove('hidden');
}
function v18OpenTraining(id){
  const r=load(KEYS.results).find(x=>x.id===id); if(!r) return;
  $('modalTitle').textContent=`Treinamento • ${r.name} • ${r.average}%`;
  $('modalBody').innerHTML=`<div class="auditSummary"><div><span>Modo</span><b>${v17Esc(r.mode)}</b></div><div><span>Data</span><b>${new Date(r.at).toLocaleString('pt-BR')}</b></div><div><span>Média</span><b>${r.average}%</b></div><div><span>Resolvidos</span><b>${r.solved||0}</b></div></div><h3>Atendimentos deste treino</h3><div class="cardsList">${(r.cases||[]).map((c,i)=>`<div class="caseCard"><b>${i+1}. ${v17Esc(c.title||'Caso')}</b><small>Nota ${c.score}% • ${v17Esc(c.outcome||'concluído')} • ${c.time||0}s</small><div class="actions"><button class="primary small openConversation" data-index="${i}">Ver conversa</button></div></div>`).join('')||'<p>Sem casos gravados.</p>'}</div><div class="actions"><button class="secondary" id="backSellerHistory">Voltar ao atendente</button></div>`;
  $$('.openConversation').forEach(b=>b.onclick=()=>v18OpenConversation(id,Number(b.dataset.index)));
  $('backSellerHistory').onclick=()=>v18OpenSeller(r.name);
}
function v18OpenConversation(resultId,index){
  const r=load(KEYS.results).find(x=>x.id===resultId); if(!r) return; const c=(r.cases||[])[index]; if(!c) return;
  const msgs=(c.conversation||[]).map(m=>`<div class="msg ${m.kind==='agent'?'agentMsg':'clientMsg'}"><small>${m.at?new Date(m.at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''}</small><br>${v17Esc(m.text||'')}</div>`).join('')||'<p>Conversa completa não foi gravada nesta versão antiga.</p>';
  const analyses=(c.analyses||[]).map(a=>`<div class="caseCard"><b>Mensagem ${a.turn} • Nota ${a.score}%</b><p><b>Resposta:</b> ${v17Esc(a.answer||'')}</p>${(a.entries||[]).length?`<ul>${a.entries.map(e=>`<li><b>${v17Esc(e.metric)}:</b> ${v17Esc(e.reason)}</li>`).join('')}</ul>`:'<p>Sem erro crítico registrado.</p>'}<p><b>Alternativa:</b> ${v17Esc(a.alternative||'')}</p></div>`).join('');
  const timeline=(c.events||[]).map(e=>`<li>${v17Esc(e)}</li>`).join('');
  $('modalTitle').textContent=`Conversa • ${c.clientName||'Cliente'} • ${c.score}%`;
  $('modalBody').innerHTML=`<div class="auditSummary"><div><span>Caso</span><b>${v17Esc(c.title||'')}</b></div><div><span>Resultado</span><b>${v17Esc(c.outcome||'')}</b></div><div><span>Tempo</span><b>${c.time||0}s</b></div><div><span>Nota</span><b>${c.score}%</b></div></div><h3>Conversa completa</h3><div class="auditChat">${msgs}</div><h3>Linha do tempo</h3><ul class="timeline">${timeline||'<li>Sem eventos registrados.</li>'}</ul><h3>Análise das respostas</h3><div class="cardsList compact">${analyses||'<p>Sem análise detalhada nesta versão antiga.</p>'}</div><h3>Supervisor IA</h3><div class="supervisor">${c.supervisorHtml||'<p>Sem relatório salvo.</p>'}</div><div class="actions"><button class="secondary" id="backTraining">Voltar ao treinamento</button></div>`;
  $('backTraining').onclick=()=>v18OpenTraining(resultId);
}
refreshManager = function(){
  const results=load(KEYS.results), cases=getCases(); const avg=results.length?Math.round(results.reduce((s,r)=>s+r.average,0)/results.length):0; const solved=results.reduce((s,r)=>s+(r.solved||0),0);
  if($('managerCards')) $('managerCards').innerHTML=`<div><span>Treinamentos</span><b>${results.length}</b></div><div><span>Média geral</span><b>${avg}%</b></div><div><span>Casos ativos</span><b>${activeCases().length}</b></div><div><span>Atendimentos</span><b>${solved}</b></div>`;
  const bySeller={}; results.forEach(r=>{bySeller[r.name]=bySeller[r.name]||{count:0,avg:0,xp:0}; bySeller[r.name].count++; bySeller[r.name].avg+=r.average; bySeller[r.name].xp+=r.xp;});
  if($('rankingList')) $('rankingList').innerHTML=Object.entries(bySeller).sort((a,b)=>b[1].xp-a[1].xp).map(([n,v],i)=>`<div class="caseCard sellerCard" data-name="${v17Esc(n)}"><b>${i+1}º ${v17Esc(n)}</b><small>${v.count} treinos • média ${Math.round(v.avg/v.count)}% • ${v.xp} XP</small><div class="actions"><button class="primary small openSellerHistory" data-name="${v17Esc(n)}">Ver histórico</button><button class="secondary small clearSellerHistory" data-name="${v17Esc(n)}">Excluir histórico</button></div></div>`).join('')||'<p>Sem resultados.</p>';
  if($('resultsList')) $('resultsList').innerHTML=results.slice(0,8).map(r=>`<div class="caseCard"><b>${v17Esc(r.name)}<small>${v17Esc(r.mode)} • ${r.average}% • ${new Date(r.at).toLocaleString('pt-BR')}</small></b><p>${r.solved} caso(s) resolvido(s)</p><div class="actions"><button class="secondary small openTraining" data-id="${r.id}">Abrir</button></div></div>`).join('')||'<p>Sem resultados.</p>';
  const byCase={}; results.flatMap(r=>r.cases||[]).forEach(c=>{byCase[c.title]=byCase[c.title]||{count:0,avg:0}; byCase[c.title].count++; byCase[c.title].avg+=c.score;});
  if($('caseStatsList')) $('caseStatsList').innerHTML=Object.entries(byCase).map(([t,v])=>`<div class="caseCard"><b>${v17Esc(t)}</b><small>${v.count} atendimentos • média ${Math.round(v.avg/v.count)}%</small></div>`).join('')||'<p>Sem dados.</p>';
  if($('auditList')) $('auditList').innerHTML=load(KEYS.audits).map(a=>`<div class="caseCard"><b>${v17Esc(a.action)}: ${v17Esc(a.title)}</b><small>${v17Esc(a.by)} • ${new Date(a.at).toLocaleString('pt-BR')}</small></div>`).join('')||'<p>Sem alterações.</p>';
  if($('managerNoticeList')) $('managerNoticeList').innerHTML='<p class="hintText">A central lateral foi removida. Use o sino e os avisos no canto da tela.</p>';
  $$('.openSellerHistory').forEach(b=>b.onclick=e=>{ e.stopPropagation(); v18OpenSeller(b.dataset.name); });
  $$('.sellerCard').forEach(card=>card.onclick=e=>{ if(e.target.tagName!=='BUTTON') v18OpenSeller(card.dataset.name); });
  $$('.clearSellerHistory').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const name=b.dataset.name; if(!confirm(`Excluir todo o histórico de ${name}?`)) return; save(KEYS.results, load(KEYS.results).filter(r=>r.name!==name)); notify('Histórico excluído',`Histórico de ${name} foi removido.`); refreshAll(); });
  $$('#resultsList .openTraining').forEach(b=>b.onclick=()=>v18OpenTraining(b.dataset.id));
};
finishSession = function(){
 if(!currentSession)return; const name=($('sellerName').value||'').trim(); if(!name){ alert('Informe seu nome para salvar o treinamento.'); $('sellerName').focus(); show('homeScreen'); return; }
 clearIdleTimers(); clearInterval(timer); if(V17.live) v17StopLiveShift();
 const avg=currentSession.scores.length?Math.round(currentSession.scores.reduce((a,b)=>a+b,0)/currentSession.scores.length):0;
 const result={id:currentSession.id,name,team:$('sellerTeam').value,mode:$('modeBadge').textContent,average:avg,xp:currentSession.xp,solved:currentSession.solved,cases:currentSession.cases,startedAt:currentSession.start,at:new Date().toISOString()};
 const results=load(KEYS.results); results.unshift(result); save(KEYS.results,results); localStorage.setItem(KEYS.xp,Number(localStorage.getItem(KEYS.xp)||0)+currentSession.xp);
 notify('Treinamento finalizado',`${result.name} finalizou ${result.mode} com média ${avg}%.`); currentSession=null; alert(`Sessão finalizada! Média: ${avg}%`); show('homeScreen'); refreshAll();
};
// Garante eventos finais após sobrescritas
v18EnsureToast(); v18EnsureManagerModal(); refreshAll();


/* =====================================================
   V19 - MOTOR DE IA CONTEXTUAL E CORREÇÕES DE USABILIDADE
   - Cliente lê a resposta do atendente e reage conforme produto/caso
   - Remove respostas sem contexto entre produtos diferentes
   - Corrige Enter/Shift+Enter e troca alert por validação/toast
   - Evita cobrança repetida do cliente
   ===================================================== */
function v19ShowValidation(msg){
  if(typeof v18Toast==='function') v18Toast('Atenção', msg);
  const box=$('answerBox');
  if(!box) return;
  box.classList.add('inputError');
  let el=$('answerValidationMsg');
  if(!el){ box.insertAdjacentHTML('afterend', '<div id="answerValidationMsg" class="validationMsg"></div>'); el=$('answerValidationMsg'); }
  el.textContent=msg;
  clearTimeout(window.__answerValidationTimer);
  window.__answerValidationTimer=setTimeout(()=>{ box.classList.remove('inputError'); if(el) el.textContent=''; },2600);
}
function v19Clean(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function v19Any(t, arr){ return arr.some(w=>t.includes(w)); }
function v19Context(c){
  const product=v19Clean(c?.product), category=v19Clean(c?.category), title=v19Clean(c?.title), message=v19Clean(c?.message), ideal=v19Clean(c?.ideal), history=v19Clean((c?.history||[]).join(' '));
  const all=[product,category,title,message,ideal,history].join(' ');
  let domain='geral';
  if(product.includes('refinanciamento de veiculo') || product.includes('financiamento de veiculo') || all.includes('carro') || all.includes('veiculo')) domain='veiculo_refin';
  else if(all.includes('ctps') || all.includes('carteira de trabalho') || all.includes('autorizacao')) domain='ctps_autorizacao';
  else if(all.includes('valor baixo') || all.includes('valor ficou') || (all.includes('valor') && all.includes('taxa'))) domain='valor_baixo';
  else if(all.includes('reprov')) domain='reprovado';
  else if(all.includes('pagamento') || all.includes('pix') || all.includes('devolv')) domain='pagamento';
  else if(all.includes('boleto') || all.includes('demissao') || all.includes('parcela')) domain='boleto';
  else if(all.includes('quitacao') || all.includes('liquidacao') || all.includes('saldo devedor')) domain='quitacao';
  else if(all.includes('fgts')) domain='fgts';
  return {product,category,title,message,ideal,history,all,domain};
}
function v19AnalyzeAnswer(answer,c){
  const t=v19Clean(answer), ctx=v19Context(c);
  const has={
    empathy:v19Any(t,['entendo','compreendo','imagino','fica tranquilo','vou te ajudar','sua preocupacao','faz sentido','lamento','sinto muito','sem problemas']),
    nextStep:v19Any(t,['proximo passo','seguir','continuar','cadastro','simulacao','simular','assinar','autorizar','me confirma','me envie','envie','manda','vou verificar','posso verificar','vou consultar','print','cpf','documento','dados','placa','renavam']),
    explains:v19Any(t,['porque','motivo','ocorre','acontece','devido','por conta','analise','politica','taxa','banco','dataprev','ctps','carteira de trabalho','autorizacao','avaliacao','veiculo','garantia','refinanciamento','proposta']),
    unsafe:/garanto|garantido|100%|certeza que cai|vai cair hoje|aprova com certeza|prometo/.test(t),
    short:t.length<45 || /^(ok|certo|sim|nao|aguarde|so aguardar|vou ver|verifiquei|deseja\??)$/i.test(answer.trim()),
    asksCpf:/\bcpf\b|documento|cadastro|dados/.test(t),
    mentionsCtps:v19Any(t,['ctps','carteira de trabalho','autorizar','autorizacao','print','erro','aplicativo']),
    mentionsVehicle:v19Any(t,['veiculo','carro','moto','quitado','refinanciamento','placa','renavam','documento do veiculo','avaliacao','alienado','garantia']),
    mentionsLoanQuit:/quitacao|liquidacao|quitar tudo|saldo devedor|boleto de quitacao/.test(t),
    mentionsValue:v19Any(t,['valor','baixo','taxa','juros','oferta','proposta','liberad','esperar','condicao','dataprev']),
    mentionsPayment:v19Any(t,['pagamento','pix','cair','deposito','conta','banco','chave','devolvido']),
    mentionsReprov:/reprovad|politica interna|restricao|analise interna|banco nao aprovou/.test(t),
    mentionsBoleto:v19Any(t,['boleto','parcela','mensalmente','demissao','saiu da empresa','rescisao'])
  };
  const score = (has.empathy?1:0)+(has.nextStep?1:0)+(has.explains?1:0);
  return {...has, ctx, quality:score, irrelevant:
    (ctx.domain==='veiculo_refin' && (has.mentionsCtps || has.mentionsLoanQuit && !has.mentionsVehicle)) ||
    (ctx.domain==='ctps_autorizacao' && has.mentionsVehicle) ||
    (ctx.domain==='valor_baixo' && (has.mentionsVehicle || has.mentionsLoanQuit && !has.mentionsValue))
  };
}
function v19Pick(conv, arr){
  const st=conv?.realistic || realistic || {};
  st.usedV19=st.usedV19||[];
  let list=arr.filter(x=>!st.usedV19.includes(x));
  if(!list.length){ st.usedV19=[]; list=arr; }
  const msg=list[Math.floor(Math.random()*list.length)] || arr[0];
  st.usedV19.push(msg);
  return msg;
}
function v19ClientReplyByAnswer(c, ev, answer){
  const st=realistic || {}; const a=v19AnalyzeAnswer(answer,c); const ctx=a.ctx;
  const conv = V17?.conversations?.find(x=>x.realistic===st) || null;
  if(ev.flags.offensive) return {end:true,outcome:'desistiu',text:v19Pick(conv,['Nossa... desse jeito eu não vou continuar.','Achei essa resposta bem inadequada. Vou encerrar por aqui.'])};
  if(a.unsafe) return {text:v19Pick(conv,['Você consegue mesmo garantir isso? Tenho medo de depois dar problema.','Mas se não acontecer desse jeito, como fica?','Prefiro que você me explique sem promessa, para eu entender certo.'])};
  if(a.irrelevant) return {text:v19Pick(conv,[`Mas meu caso é sobre ${c.product}. O que isso tem a ver com o que eu perguntei?`,'Acho que misturou com outro atendimento. Pode verificar meu caso de novo?','Não entendi a relação dessa orientação com o meu caso.'])};
  if(a.short || ev.flags.badShort) return {text:v19Pick(conv,['Ficou muito curto para mim. Pode explicar melhor o que eu preciso fazer?','Não entendi direito. Qual é o próximo passo exatamente?','Ainda fiquei com dúvida. Pode detalhar um pouco mais?'])};
  if(ev.flags.insecure) return {text:v19Pick(conv,['Assim eu fico mais inseguro ainda. Você consegue verificar certinho antes de eu seguir?','Entendi, mas preciso de uma orientação mais segura.','Se a informação não está clara, prefiro não assinar ainda.'])};
  if(ctx.domain==='veiculo_refin'){
    if(a.mentionsVehicle && a.nextStep && (a.explains || a.empathy)){
      if(st.turns>=2 || ev.total>=82) return {end:true,outcome:'aceitou',text:v19Pick(conv,['Entendi. Pode seguir com a simulação do refinanciamento do veículo para mim.','Agora ficou claro. Quero ver quanto consigo usando meu veículo.','Certo, pode continuar comigo e verificar a proposta.'])};
      return {text:v19Pick(conv,['Entendi. Quais dados do veículo você precisa para consultar?','Certo. Precisa de placa, documento ou CPF para verificar?','Tá, e quanto tempo demora para saber o valor que libera?','Meu carro precisa estar quitado mesmo ou pode estar financiado?'])};
    }
    if(!a.mentionsVehicle) return {text:v19Pick(conv,['Mas no meu caso é usando o carro. Como funciona esse refinanciamento?','Você consegue me explicar usando o veículo como garantia?','Quais dados do carro você precisa para verificar?'])};
    return {text:v19Pick(conv,['Entendi a parte do veículo, mas qual é o próximo passo?','Certo, e como faço para continuar a simulação?','Tem alguma taxa antes de liberar?'])};
  }
  if(ctx.domain==='ctps_autorizacao'){
    if(a.mentionsCtps && a.nextStep){
      if(st.turns>=2 && ev.total>=75) return {end:true,outcome:'concluído',text:v19Pick(conv,['Agora entendi. Vou tentar novamente na Carteira de Trabalho e te mando print se aparecer erro.','Certo, vou seguir esse passo e retorno se não conseguir finalizar.'])};
      return {text:v19Pick(conv,['Entendi. Se aparecer erro eu te mando o print, certo?','Tá, vou tentar autorizar novamente na Carteira de Trabalho. Onde eu clico depois disso?','Certo. Preciso sair e entrar no aplicativo de novo?'])};
    }
    return {text:v19Pick(conv,['Mas o problema está na autorização da Carteira de Trabalho. O que faço lá?','Não consegui finalizar a autorização. Você precisa de print do erro?','Pode me orientar passo a passo na CTPS?'])};
  }
  if(ctx.domain==='valor_baixo'){
    if(a.mentionsValue && a.explains && a.nextStep){
      if(st.turns>=2 || ev.total>=82) return {end:true,outcome:'aceitou',text:v19Pick(conv,['Agora fez sentido. Se a condição pode mudar, pode seguir com a simulação/cadastro para mim.','Entendi melhor. Então vamos aproveitar essa condição e seguir.','Tá, agora ficou claro. Pode continuar comigo.'])};
      return {text:v19Pick(conv,['Entendi o motivo. Então o que preciso confirmar para seguir?','Certo, e para garantir essa condição eu faço o cadastro agora?','Tá, se eu esperar pode mudar. Pode continuar comigo.'])};
    }
    return {text:v19Pick(conv,['Mas por que esse valor pode mudar?','Não entendi o que a taxa tem a ver com isso.','Será que não compensa esperar mais um pouco?'])};
  }
  if(ctx.domain==='pagamento'){
    if(a.mentionsPayment && a.nextStep) return {text:v19Pick(conv,['Certo. Você consegue conferir pelo meu CPF?','Entendi. Se voltou o pagamento, como faço para trocar a conta?','Tá, qual prazo real para resolver isso?'])};
    return {text:v19Pick(conv,['Mas o dinheiro ainda não caiu. Como eu acompanho isso?','E se voltou o pagamento, o que eu preciso mandar?','Você consegue verificar minha proposta?'])};
  }
  if(ctx.domain==='reprovado'){
    if(a.mentionsReprov && a.nextStep) return {text:v19Pick(conv,['Entendi. Então tenta por outro banco para mim, por favor.','Tá, se esse banco não aprovou, podemos tentar outra opção?','Certo. Eu tenho chance em outro banco?'])};
    return {text:v19Pick(conv,['Mas eu assinei o contrato, como foi reprovado?','Não entendi o motivo da reprovação.','Tem algo que eu possa fazer para tentar novamente?'])};
  }
  if(ctx.domain==='boleto'){
    if(a.mentionsBoleto && a.nextStep) return {text:v19Pick(conv,['Certo, então posso solicitar o boleto mensalmente com vocês.','Entendi. Quando vencer a próxima parcela eu chamo vocês.','Tá bom, obrigado por explicar.'])};
    return {text:v19Pick(conv,['Como eu faço para pagar agora que saí da empresa?','Vai descontar da minha rescisão ou preciso pedir boleto?','Onde solicito esse boleto?'])};
  }
  if(ctx.domain==='quitacao'){
    if(a.mentionsLoanQuit && a.nextStep) return {text:v19Pick(conv,['Entendi. Quero o boleto de quitação então.','Certo, pode solicitar o valor para mim?','Tá bom. E qual o prazo para baixa depois que eu pagar?'])};
    return {text:v19Pick(conv,['Eu quero quitar tudo. Como faço?','Qual é a diferença entre quitar e antecipar?','Depois que pagar, quando dá baixa?'])};
  }
  if(a.empathy && a.explains && a.nextStep && ev.total>=80){
    if(st.turns>=2) return {end:true,outcome:'aceitou',text:v19Pick(conv,['Agora ficou claro. Pode seguir com o atendimento para mim.','Entendi, obrigado por explicar. Pode continuar.','Tá certo, vamos seguir então.'])};
    return {text:v19Pick(conv,['Certo, agora entendi melhor. Qual o próximo passo?','Beleza. O que você precisa de mim agora?','Tá, consegue continuar por aqui mesmo?'])};
  }
  if(a.nextStep && ev.total>=70) return {text:v19Pick(conv,['Certo, vou te mandar. Depois disso o que acontece?','Beleza. Qual informação você precisa primeiro?','Tá, e você consegue resolver por aqui mesmo?'])};
  return {text:v19Pick(conv,['Pode explicar de um jeito mais simples?','Ainda fiquei com dúvida.','Entendi uma parte, mas não sei o que faço agora.'])};
}
realisticClientReply = function(c,ev,answer){
  const st=realistic;
  if(!st || st.closed) return {end:true,outcome:'encerrado',text:'Atendimento encerrado.'};
  if(st.trust<=8) return {end:true,outcome:'desistiu',text:v19Pick(null,['Olha, eu não me senti seguro para seguir. Vou deixar para depois.','Ainda não me passou segurança. Prefiro encerrar por enquanto.'])};
  if(st.patience<=8) return {end:true,outcome:'perdeu paciência',text:v19Pick(null,['Acho que essa conversa não vai resolver meu problema. Vou encerrar por aqui.','Demorou bastante e eu acabei perdendo a confiança. Vou deixar para depois.'])};
  const reply=v19ClientReplyByAnswer(c,ev,answer);
  if(reply.end) return reply;
  if(st.turns>=6){
    if(st.trust>=60 && ev.total>=70) return {end:true,outcome:'aceitou',text:v19Pick(null,['Tá certo, já consegui entender. Pode seguir com a proposta.','Agora ficou claro. Vamos seguir.'])};
    return {end:true,outcome:'desistiu',text:v19Pick(null,['Vou pensar melhor e qualquer coisa volto depois.','Ainda fiquei em dúvida, vou deixar para outro momento.'])};
  }
  return reply;
};
function v19BindAnswerBox(){
  const old=$('answerBox'); if(!old || old.dataset.v19Bound==='1') return;
  const fresh=old.cloneNode(true); fresh.dataset.v19Bound='1'; old.parentNode.replaceChild(fresh, old);
  fresh.addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      if(selectedMode==='conversa' && V17 && V17.live) v17SendAnswer(); else sendAnswer();
    }
  });
  fresh.addEventListener('input',()=>{ if(typeof scheduleTypingInterrupt==='function') scheduleTypingInterrupt(); const msg=$('answerValidationMsg'); if(msg) msg.textContent=''; fresh.classList.remove('inputError'); });
}
setTimeout(()=>{
  v19BindAnswerBox();
  if($('sendAnswerBtn')) $('sendAnswerBtn').onclick=()=>{ if(selectedMode==='conversa' && V17 && V17.live) v17SendAnswer(); else sendAnswer(); };
  if(window.CONCREDITO_CASES){ window.CONCREDITO_CASES.forEach(c=>{ if(c.category==='Pendência') c.category='Autorização CTPS'; }); }
  if(window.CONCREDITO_CATEGORIES){ window.CONCREDITO_CATEGORIES=window.CONCREDITO_CATEGORIES.map(c=>c==='Pendência'?'Autorização CTPS':c); }
  fillSelects?.(); refreshAll?.();
},0);

/* =====================================================
   V20 - IA CONTEXTUAL NÍVEL 2
   - Cliente lê a resposta do atendente dentro do contexto do caso
   - Análise invisível em JSON/estado antes de gerar a fala
   - Personalidade e humor mudam conforme a qualidade do atendimento
   - Perguntas novas e coerentes com o produto/caso
   - Trava contra mudança de assunto e repetição de respostas
   ===================================================== */
const V20 = { version:'v20_ia_nivel_2_contextual' };
function v20Clean(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim(); }
function v20Any(t, arr){ return arr.some(w=>t.includes(w)); }
function v20Rand(arr){ return arr[Math.floor(Math.random()*arr.length)] || arr[0] || ''; }
function v20Conversation(){
  if(typeof V17!=='undefined' && Array.isArray(V17.conversations) && activeCase){
    const found = V17.conversations.find(x=>x.case && x.case.id===activeCase.id);
    if(found) return found;
  }
  return null;
}
function v20State(st,c){
  st.v20 = st.v20 || {
    stage:'inicio', confidence: st.trust ?? 45, mood: st.persona?.mood || 'neutro',
    asked:[], known:[], lastReplies:[], objectives:[], turns:0
  };
  if(!st.v20.objectives.length){
    const ctx=v20Context(c);
    st.v20.objectives = v20Objectives(ctx);
  }
  return st.v20;
}
function v20Context(c){
  const product=v20Clean(c?.product), category=v20Clean(c?.category), title=v20Clean(c?.title), message=v20Clean(c?.message), ideal=v20Clean(c?.ideal), goal=v20Clean(c?.goal), criteria=v20Clean(c?.criteria), hint=v20Clean(c?.hint), history=v20Clean((c?.history||[]).join(' '));
  const all=[product,category,title,message,ideal,goal,criteria,hint,history].join(' ');
  let domain='geral';
  if(product.includes('refinanciamento de veiculo') || title.includes('refinanciar veiculo') || all.includes('carro quitado') || (all.includes('veiculo') && all.includes('garantia'))) domain='veiculo_refin';
  else if(product.includes('financiamento de veiculo') || (all.includes('financiar') && all.includes('veiculo'))) domain='veiculo_fin';
  else if(all.includes('ctps') || all.includes('carteira de trabalho') || all.includes('autorizacao')) domain='ctps_autorizacao';
  else if(all.includes('valor baixo') || all.includes('valor ficou') || all.includes('esperar mais') || (all.includes('valor') && all.includes('taxa'))) domain='valor_baixo';
  else if(all.includes('golpe') || all.includes('taxa antecipada') || all.includes('seguranca')) domain='seguranca';
  else if(all.includes('reprov')) domain='reprovado';
  else if(all.includes('pagamento') || all.includes('pix') || all.includes('devolv') || all.includes('nao caiu')) domain='pagamento';
  else if(all.includes('boleto') || all.includes('demissao') || all.includes('parcela')) domain='boleto';
  else if(all.includes('quitacao') || all.includes('liquidacao') || all.includes('saldo devedor')) domain='quitacao';
  else if(product.includes('fgts') || all.includes('fgts')) domain='fgts';
  else if(product.includes('inss') || all.includes('margem')) domain='inss';
  else if(product.includes('bolsa familia')) domain='bolsa_familia';
  return {product,category,title,message,ideal,goal,criteria,hint,history,all,domain, raw:c};
}
function v20Objectives(ctx){
  const map={
    veiculo_refin:['entender se o veículo pode ser usado como garantia','saber quais dados do carro precisa enviar','confirmar se há taxa e prazo de análise','aceitar seguir para simulação'],
    veiculo_fin:['saber documentos necessários','entender início da análise','aceitar enviar dados do veículo'],
    ctps_autorizacao:['conseguir concluir a autorização na CTPS','saber se precisa mandar print do erro','entender o próximo passo após autorizar'],
    valor_baixo:['entender por que o valor veio baixo','avaliar se vale esperar','aceitar seguir se a explicação for segura'],
    seguranca:['confirmar que não é golpe','entender canais oficiais e ausência de taxa antecipada','sentir confiança para continuar'],
    pagamento:['localizar proposta pelo CPF','entender por que o dinheiro não caiu','saber próximo passo se houver devolução'],
    reprovado:['entender a reprovação sem termos internos','saber se existe alternativa em outro banco','decidir se tenta nova opção'],
    boleto:['entender como pagar após sair da empresa','saber como solicitar boleto','saber o que acontece com parcelas restantes'],
    quitacao:['entender diferença entre quitação e antecipação','pedir boleto de quitação','saber prazo de baixa'],
    fgts:['entender bloqueio/contrato FGTS','confirmar consulta por CPF','saber próximo passo'],
    inss:['entender margem insuficiente','saber quando consultar novamente','não receber promessa indevida'],
    bolsa_familia:['saber se existe opção disponível','entender que depende de consulta','enviar CPF para análise segura'],
    geral:['entender a orientação','sentir segurança','saber o próximo passo']
  };
  return map[ctx.domain] || map.geral;
}
function v20AnalyzeAttendant(answer,c,ev){
  const t=v20Clean(answer), ctx=v20Context(c);
  const terms={
    empathy:v20Any(t,['entendo','compreendo','imagino','fica tranquilo','vou te ajudar','sua preocupacao','lamento','sinto muito','sem problemas','vamos resolver','te ajudo']),
    nextStep:v20Any(t,['proximo passo','seguir','continuar','cadastro','simulacao','simular','assinar','autorizar','me confirma','me envie','envie','manda','vou verificar','posso verificar','vou consultar','print','cpf','documento','dados','placa','renavam','modelo','ano','te oriento']),
    explains:v20Any(t,['porque','motivo','ocorre','acontece','devido','por conta','analise','politica','taxa','banco','dataprev','ctps','carteira de trabalho','autorizacao','avaliacao','garantia','refinanciamento','proposta','margem','consulta']),
    asksData:v20Any(t,['cpf','documento','dados','placa','renavam','modelo','ano','print','comprovante','numero do contrato']),
    safe:v20Any(t,['sem taxa antecipada','canal oficial','contrato','assinatura digital','comprovante','consultar com seguranca','verificar no sistema','nao consigo confirmar sem consultar','depende da analise']),
    commercial:v20Any(t,['condicao','oportunidade','seguir agora','simular','ver outra opcao','outro banco','melhor alternativa','continuar','proposta']),
    unsafe:/garanto|garantido|100%|certeza que cai|vai cair hoje|aprova com certeza|prometo|sem erro/.test(t),
    vague:t.length<45 || /^(ok|certo|sim|nao|aguarde|so aguardar|vou ver|verifiquei|deseja\??|pode ser)$/i.test(String(answer||'').trim())
  };
  const topic={
    ctps:v20Any(t,['ctps','carteira de trabalho','autorizar','autorizacao','app carteira','print do erro']),
    vehicle:v20Any(t,['veiculo','carro','moto','quitado','refinanciamento','placa','renavam','documento do veiculo','avaliacao','alienado','garantia','modelo','ano']),
    value:v20Any(t,['valor','baixo','taxa','juros','oferta','proposta','liberad','esperar','condicao','dataprev']),
    payment:v20Any(t,['pagamento','pix','cair','deposito','conta','banco','chave','devolvido']),
    reprov:/reprovad|politica interna|restricao|analise interna|banco nao aprovou/.test(t),
    boleto:v20Any(t,['boleto','parcela','mensalmente','demissao','saiu da empresa','rescisao']),
    quit:/quitacao|liquidacao|quitar tudo|saldo devedor|boleto de quitacao/.test(t),
    security:v20Any(t,['golpe','seguro','canal oficial','taxa antecipada','contrato','cnpj'])
  };
  let irrelevant=false;
  if(ctx.domain==='veiculo_refin' && (topic.ctps || (topic.quit && !topic.vehicle))) irrelevant=true;
  if(ctx.domain==='ctps_autorizacao' && topic.vehicle) irrelevant=true;
  if(ctx.domain==='valor_baixo' && (topic.vehicle || (topic.quit && !topic.value))) irrelevant=true;
  if(ctx.domain==='pagamento' && topic.vehicle) irrelevant=true;
  if(ctx.domain==='seguranca' && topic.vehicle && !topic.security) irrelevant=true;
  const missing=[];
  if(!terms.empathy && ['nervoso','bravo','desconfiado','desesperado'].some(x=>ctx.all.includes(x))) missing.push('empatia');
  if(!terms.explains) missing.push('explicação');
  if(!terms.nextStep) missing.push('próximo passo');
  if(['pagamento','fgts','boleto','quitacao'].includes(ctx.domain) && !terms.asksData && !terms.nextStep) missing.push('dados para consulta');
  let quality=(terms.empathy?20:0)+(terms.explains?28:0)+(terms.nextStep?30:0)+(terms.safe?12:0)+(terms.commercial?10:0);
  if(terms.vague) quality-=35;
  if(terms.unsafe) quality-=35;
  if(irrelevant) quality-=45;
  if(ev?.flags?.offensive) quality=0;
  quality=Math.max(0,Math.min(100, Math.round((quality + (ev?.total||70))/2)));
  let resolution='nao_resolveu';
  if(quality>=82) resolution='resolveu'; else if(quality>=60) resolution='parcial';
  return {ctx,terms,topic,irrelevant,missing,quality,resolution,raw:answer};
}
function v20UpdateConversationState(st,c,analysis){
  const state=v20State(st,c);
  state.turns++;
  const oldMood=state.mood;
  if(analysis.terms.unsafe || analysis.irrelevant || analysis.quality<45){
    state.confidence=Math.max(0,state.confidence-18); st.trust=Math.max(0,(st.trust||50)-12); st.patience=Math.max(0,(st.patience||60)-10); state.mood = st.trust<25 ? 'irritado' : 'confuso';
    state.stage = 'duvida';
  } else if(analysis.resolution==='parcial'){
    state.confidence=Math.min(100,state.confidence+7); st.trust=Math.min(100,(st.trust||50)+5); state.mood = state.confidence>55 ? 'neutro' : 'inseguro';
    state.stage = 'aprofundar';
  } else {
    state.confidence=Math.min(100,state.confidence+18); st.trust=Math.min(100,(st.trust||50)+12); st.patience=Math.min(100,(st.patience||60)+4); state.mood = state.confidence>=75 ? 'satisfeito' : 'tranquilo';
    state.stage = state.turns>=2 ? 'fechamento' : 'confiando';
  }
  if(oldMood!==state.mood && Array.isArray(st.events)) st.events.push(`Humor do cliente mudou de ${oldMood} para ${state.mood}.`);
  return state;
}
function v20Say(st, msg){
  const state=st?.v20 || {}; state.lastReplies=state.lastReplies||[];
  let out=msg;
  if(state.lastReplies.includes(out)){
    out = out + ' Pode me orientar melhor?';
  }
  state.lastReplies.push(out); state.lastReplies=state.lastReplies.slice(-6);
  return out;
}
function v20StyleMessage(msg, st){
  const persona=st?.persona?.id || 'tranquilo';
  const mood=st?.v20?.mood || st?.mood || 'neutro';
  let m=msg;
  if(persona==='nervoso' || mood==='irritado'){
    if(Math.random()<0.35) m = m.replace(/\.$/,'') + '...';
    if(Math.random()<0.25) m = m.toUpperCase();
  } else if(persona==='whatsapp'){
    m = m.replace(/Certo,/g,'Tá,').replace(/Entendi\./g,'entendi').replace(/por favor/g,'pfv');
    if(Math.random()<0.35) m += ' kk';
  } else if(persona==='idoso'){
    m = m.replace('Tá,','Certo,').replace('kk','');
    // sem “meu filho” fixo; só usa variações neutras e raras.
    if(Math.random()<0.18) m = m.replace(/\?$/,'? Estou um pouco perdido.');
  } else if(persona==='desconfiado'){
    if(!/\?/.test(m) && Math.random()<0.35) m += ' Isso é seguro mesmo?';
  } else if(persona==='apressado'){
    m = m.length>115 ? m.slice(0,112)+'?' : m;
  } else if(persona==='desesperado'){
    if(Math.random()<0.25) m = 'Eu preciso resolver isso hoje. ' + m;
  }
  return m;
}
function v20QuestionBank(ctx, state){
  const bank={
    veiculo_refin:[
      'Quais dados do veículo você precisa para consultar?',
      'Precisa estar no meu nome para conseguir fazer?',
      'Tem alguma taxa antes de liberar o dinheiro?',
      'Quanto tempo demora para saber o valor aprovado?',
      'Se o carro estiver quitado, ajuda na aprovação?',
      'Vocês precisam de placa e Renavam agora?'
    ],
    veiculo_fin:[
      'Quais documentos eu preciso mandar primeiro?',
      'Precisa de comprovante de renda?',
      'Dá para financiar veículo usado também?',
      'Vocês analisam antes de eu escolher o carro?'
    ],
    ctps_autorizacao:[
      'Se aparecer erro eu mando print para você?',
      'Depois de autorizar na Carteira de Trabalho, o que acontece?',
      'Preciso sair e entrar no aplicativo de novo?',
      'Onde exatamente aparece essa autorização na CTPS?',
      'Se eu clicar mais de uma vez em já autorizei, muda alguma coisa?'
    ],
    valor_baixo:[
      'Então se eu esperar pode diminuir mais?',
      'A taxa pode mudar mesmo depois da simulação?',
      'Tem como tentar outro banco para ver se melhora?',
      'Se eu seguir agora, consigo garantir essa condição?',
      'Por que meu aplicativo mostra outro valor?'
    ],
    seguranca:[
      'Vocês cobram alguma taxa antes?',
      'Como eu confirmo que esse é o canal oficial?',
      'Eu consigo ver contrato antes de assinar?',
      'E se alguém pedir Pix para liberar, isso é golpe?',
      'Fico com medo de mandar meus dados. Como funciona?'
    ],
    pagamento:[
      'Você consegue conferir pelo meu CPF?',
      'Se o pagamento voltou, como eu troco a conta?',
      'Qual prazo real depois que corrige os dados bancários?',
      'Está em análise ou já foi enviado para pagamento?',
      'Tem como mandar comprovante quando for pago?'
    ],
    reprovado:[
      'Mas por que reprovou se eu assinei?',
      'Dá para tentar em outro banco?',
      'Tem algo que eu possa corrigir para aprovar?',
      'Isso quer dizer que não tenho mais chance?',
      'A reprovação foi da ConCrédito ou do banco?'
    ],
    boleto:[
      'Como eu solicito o boleto da parcela?',
      'Vai descontar alguma coisa da minha rescisão?',
      'Depois que sair da empresa, como ficam as parcelas?',
      'Consigo pagar o restante por boleto?',
      'Tem prazo para gerar esse boleto?'
    ],
    quitacao:[
      'Qual a diferença entre quitar e antecipar?',
      'Você consegue gerar o boleto de quitação?',
      'Depois que pagar, quando baixa no sistema?',
      'O valor de quitação tem desconto de juros?',
      'Posso quitar tudo de uma vez?'
    ],
    fgts:[
      'Por que aparece bloqueio no meu FGTS?',
      'Você consegue localizar pelo meu CPF?',
      'Tem contrato vinculado a esse bloqueio?',
      'Depois de quitar, quando desbloqueia?',
      'Consigo receber uma cópia do contrato?'
    ],
    inss:[
      'O que significa margem insuficiente?',
      'Pode liberar margem depois?',
      'Tem como consultar novamente outro dia?',
      'Se eu quitar outro contrato, ajuda?'
    ],
    bolsa_familia:[
      'Então depende de consulta no meu CPF?',
      'Você consegue verificar se tem alguma opção liberada?',
      'Não é aprovação garantida, certo?',
      'Quais dados você precisa para consultar?'
    ],
    geral:[
      'Certo, e qual é o próximo passo?',
      'Você consegue verificar isso para mim?',
      'O que eu preciso te mandar agora?',
      'Pode explicar de um jeito mais simples?'
    ]
  };
  let arr=bank[ctx.domain] || bank.geral;
  const asked=state.asked||[];
  let available=arr.filter(q=>!asked.includes(q));
  if(!available.length){ state.asked=[]; available=arr; }
  const q=v20Rand(available); state.asked.push(q); return q;
}
function v20GenerateClientMessage(c, analysis, state, st){
  const ctx=analysis.ctx;
  if(analysis.irrelevant){
    return v20Say(st, v20Rand([
      `Acho que misturou com outro atendimento. Meu caso é ${c.product}.`,
      `Não entendi a relação disso com ${c.product}. Pode olhar meu caso de novo?`,
      `Mas isso tem a ver com o que eu perguntei? Eu estava falando sobre ${c.product}.`
    ]));
  }
  if(analysis.terms.unsafe){
    return v20Say(st, v20Rand([
      'Você consegue me explicar sem garantir? Tenho medo de depois dar problema.',
      'Quando você fala assim parece promessa. O que realmente depende da análise?',
      'Prefiro entender o processo certo antes de seguir.'
    ]));
  }
  if(analysis.terms.vague || analysis.quality<45){
    return v20Say(st, v20Rand([
      'Ficou muito curto para mim. Pode explicar melhor?',
      'Não entendi direito. O que eu preciso fazer agora?',
      'Você pode me orientar com mais detalhes?',
      'Assim ainda fico com dúvida. Qual seria o próximo passo?'
    ]));
  }
  if(analysis.resolution==='parcial'){
    if(analysis.missing.includes('próximo passo')) return v20Say(st, v20Rand(['Entendi a explicação, mas o que eu faço agora?','Certo, e para seguir eu preciso mandar o quê?','Tá, e qual é o próximo passo?']));
    if(analysis.missing.includes('explicação')) return v20Say(st, v20Rand(['Entendi, mas por que isso acontece?','Pode me explicar o motivo disso?','Queria entender melhor antes de seguir.']));
    return v20Say(st, v20QuestionBank(ctx,state));
  }
  // resposta boa: avança, cria pergunta nova ou encerra com sucesso se já houver confiança suficiente
  const confident = (state.confidence>=72 || (st.trust||0)>=70 || analysis.quality>=86);
  if(confident && state.turns>=2){
    const closing={
      veiculo_refin:['Agora ficou claro. Pode seguir com a simulação do refinanciamento do veículo para mim.','Entendi. Quero ver quanto consigo usando meu veículo, pode continuar.'],
      ctps_autorizacao:['Certo, vou tentar novamente na Carteira de Trabalho e te mando print se aparecer erro.','Agora entendi. Vou seguir esse passo e retorno se não conseguir.'],
      valor_baixo:['Agora fez sentido. Pode seguir com a simulação para mim.','Entendi melhor. Vamos aproveitar essa condição e seguir.'],
      seguranca:['Agora fiquei mais tranquilo. Pode continuar comigo.','Entendi. Se não tem taxa antecipada e tem contrato, podemos seguir.'],
      pagamento:['Certo, vou te passar os dados para você verificar.','Entendi. Pode consultar minha proposta então.'],
      reprovado:['Entendi. Então tenta outra opção de banco para mim.','Certo, pode verificar se existe outra alternativa.'],
      boleto:['Entendi. Quando precisar do boleto vou solicitar com vocês.','Tá bom, obrigado por explicar. Pode seguir com a orientação.'],
      quitacao:['Entendi. Quero o boleto de quitação então.','Certo, pode solicitar o valor de quitação para mim.'],
      fgts:['Entendi. Pode consultar pelo meu CPF para verificar esse bloqueio.','Certo, pode localizar o contrato para mim.'],
      inss:['Agora entendi. Podemos consultar novamente futuramente.','Certo, obrigado por explicar a margem.'],
      bolsa_familia:['Entendi. Pode verificar se existe opção disponível no meu CPF.','Certo, pode fazer a consulta para mim.'],
      geral:['Agora ficou claro. Pode seguir com o atendimento para mim.','Entendi, obrigado por explicar. Pode continuar.']
    };
    return v20Say(st, v20Rand(closing[ctx.domain]||closing.geral));
  }
  return v20Say(st, v20QuestionBank(ctx,state));
}
realisticClientReply = function(c,ev,answer){
  const st=realistic || (v20Conversation()?.realistic) || {};
  if(!st || st.closed) return {end:true,outcome:'encerrado',text:'Atendimento encerrado.'};
  if(st.trust<=8) return {end:true,outcome:'desistiu',text:v20Rand(['Olha, eu não me senti seguro para seguir. Vou deixar para depois.','Ainda não me passou segurança. Prefiro encerrar por enquanto.'])};
  if(st.patience<=8) return {end:true,outcome:'perdeu paciência',text:v20Rand(['Acho que essa conversa não vai resolver meu problema. Vou encerrar por aqui.','Demorou bastante e eu acabei perdendo a confiança. Vou deixar para depois.'])};
  const analysis=v20AnalyzeAttendant(answer,c,ev);
  const state=v20UpdateConversationState(st,c,analysis);
  if(Array.isArray(st.events)){
    st.events.push(`IA contextual analisou: ${analysis.resolution}; qualidade ${analysis.quality}%; etapa ${state.stage}.`);
    if(analysis.missing.length) st.events.push(`Faltou: ${analysis.missing.join(', ')}.`);
  }
  const msg=v20StyleMessage(v20GenerateClientMessage(c,analysis,state,st), st);
  if(analysis.resolution==='resolveu' && state.stage==='fechamento' && (state.confidence>=72 || analysis.quality>=86)){
    return {end:true,outcome:'aceitou',text:msg};
  }
  if(state.turns>=7){
    if(state.confidence>=60 && analysis.quality>=60) return {end:true,outcome:'concluído',text:v20StyleMessage(v20Rand(['Tá certo, agora consegui entender. Obrigado pela ajuda.','Entendi. Pode seguir com esse atendimento para mim.']),st)};
    return {end:true,outcome:'desistiu',text:v20StyleMessage(v20Rand(['Vou pensar melhor e qualquer coisa volto depois.','Ainda fiquei em dúvida, vou deixar para outro momento.']),st)};
  }
  return {text:msg};
};

// Atualiza o texto de versão quando existir algum rodapé/README visual futuro.
console.log('ConCrédito Simulador - V20 IA Contextual Nível 2 carregada');


/* =====================================================
   V21 - IA NÍVEL 3 COM GEMINI + PERSISTÊNCIA UNIFICADA
   - Gemini vira o cliente da conversa quando /api/cliente está disponível
   - Envia produto, caso, persona, estado, histórico completo e última resposta
   - Fallback local V20 se estiver rodando só no GitHub Pages/sem backend
   - Todos os atendimentos da Simulação Realista são salvos no mesmo formato do gestor
   ===================================================== */
const V21 = { version:'v21_ia_nivel_3_gestor_unificado' };
function v21Plain(s){ return String(s||'').trim(); }
function v21ConversationHistory(conv){
  return (conv?.messages||[]).map(m=>({kind:m.kind, text:m.text, at:m.at}));
}
function v21ClientePayload(conv, answer){
  const st=conv.realistic||{};
  return {
    caseData:{
      id:conv.case?.id, title:conv.case?.title, product:conv.case?.product, category:conv.case?.category,
      difficulty:conv.case?.difficulty, profile:conv.case?.profile, message:conv.case?.message,
      history:conv.case?.history||[], goal:conv.case?.goal||'', ideal:conv.case?.ideal||'', criteria:conv.case?.criteria||'', hint:conv.case?.hint||''
    },
    cliente:{
      nome:conv.name, persona:st.persona?.id||'', estilo:st.persona?.style||'', humor:st.mood, confianca:st.trust,
      paciencia:st.patience, interesse:st.interest, objetivoOculto:st.hiddenGoal||conv.case?.goal||''
    },
    estado:{
      etapa:st.v20?.stage||st.stage||'relato', turnos:st.turns||0, memoria:st.memory||{}, perguntasFeitas:st.v20?.asked||[],
      ultimaCobranca:conv.lastNagText||'', statusAtendente:V17.status, modo:selectedMode
    },
    history:v21ConversationHistory(conv),
    ultimaRespostaAtendente:answer
  };
}
async function v21GeminiClientReply(conv, ev, answer){
  try{
    const r=await fetch('https://backend-do-simulador-con-cr-dito-jb.vercel.app/api/cliente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v21ClientePayload(conv,answer))});
    if(!r.ok) throw new Error('API indisponível');
    const data=await r.json();
    if(!data || !data.message || data.ok===false) throw new Error(data?.analysis?.note||'Fallback');
    const st=conv.realistic||{};
    if(typeof data.trust==='number') st.trust=Math.max(0,Math.min(100,Math.round(data.trust)));
    if(typeof data.patience==='number') st.patience=Math.max(0,Math.min(100,Math.round(data.patience)));
    if(data.mood) st.mood=data.mood;
    st.stage=data.stage||st.stage;
    st.memory={...(st.memory||{}), ...(data.memory||{})};
    st.turnAnalyses=st.turnAnalyses||[];
    st.turnAnalyses.push({turn:st.turns||0, score:data.analysis?.quality??ev.total, answer, entries:[{metric:'IA Cliente Gemini', reason:data.analysis?.note||'Resposta gerada lendo contexto completo.'}], alternative:'Responder mantendo produto, objetivo e próximo passo claros.'});
    st.events=st.events||[];
    st.events.push(`Gemini Nível 3 analisou: ${data.analysis?.resolution||'contextual'}; qualidade ${data.analysis?.quality??ev.total}%; etapa ${data.stage||st.stage||'não informada'}.`);
    return {text:String(data.message).trim(), end:!!data.end, outcome:data.outcome||'concluído'};
  }catch(err){
    const oldA=activeCase, oldR=realistic; activeCase=conv.case; realistic=conv.realistic;
    const rep=realisticClientReply(conv.case,ev,answer);
    realistic?.events?.push?.(`Fallback local V20 usado porque a API Gemini não respondeu: ${err.message}.`);
    activeCase=oldA; realistic=oldR;
    return rep;
  }
}
function v21CasePayloadFromConversation(conv, score, outcome){
  return {
    caseId:conv.case.id,
    title:conv.case.title,
    score:Math.round(score||0),
    answer:(conv.answerLog||[]).join(' | '),
    time:Math.round((Date.now()-(conv.createdAt||Date.now()))/1000),
    outcome:outcome||conv.outcome||'concluído',
    conversation:v21ConversationHistory(conv),
    analyses:conv.realistic?.turnAnalyses||[],
    events:conv.realistic?.events||[],
    memory:conv.realistic?.memory||{},
    supervisorHtml:conv.supervisorHtml||'',
    caseData:{...conv.case},
    startedAt:conv.createdAt,
    finishedAt:Date.now(),
    clientName:conv.name,
    mode:'Simulação Realista',
    difficulty:conv.case?.difficulty,
    product:conv.case?.product
  };
}
function v21SaveConversationToSession(conv, score, outcome){
  if(!currentSession || !conv || conv.savedToSession) return;
  conv.savedToSession=true;
  currentSession.cases.push(v21CasePayloadFromConversation(conv, score, outcome));
}
// IA Nível 3 para a Simulação Realista: resposta assíncrona e contextual via Gemini.
v17SendAnswer = function(){
  const conv=V17.conversations.find(c=>c.id===V17.activeId); if(!conv) return;
  const answer=($('answerBox')?.value||'').trim();
  if(answer.length<2){ v19ShowValidation('Digite uma resposta antes de enviar.'); return; }
  clearTimeout(conv.nagTimer); conv.status='awaiting_client'; conv.lastAgentAt=Date.now(); conv.botNoticeSent=false;
  const oldActive=activeCase, oldReal=realistic; activeCase=conv.case; realistic=conv.realistic;
  v17AddMessage(conv,'agent',answer); conv.answerLog.push(answer); $('answerBox').value='';
  const ev=evaluate(answer,conv.case); applyRealisticState(ev,answer);
  activeCase=oldActive; realistic=oldReal;
  $('sendAnswerBtn').disabled=true; $('answerBox').disabled=true;
  const cfg=v17DifficultyConfig(); const delay=cfg.replyMin+Math.random()*(cfg.replyMax-cfg.replyMin);
  clearTimeout(conv.replyTimer); conv.replyTimer=setTimeout(async()=>{
    if(conv.closed||conv.awaitingClose) return;
    const rep=await v21GeminiClientReply(conv,ev,answer);
    if(conv.closed||conv.awaitingClose) return;
    v17AddMessage(conv,'client',rep.text);
    if(rep.end){ v17CompleteConversation(conv,ev,answer,rep.outcome||'concluído'); }
    if(V17.activeId===conv.id && !conv.awaitingClose){ $('sendAnswerBtn').disabled=false; $('answerBox').disabled=false; $('answerBox').focus(); }
  }, delay);
};
// Reforça o wrapper principal após sobrescritas antigas.
sendAnswer = function(){ if(selectedMode==='conversa'&&V17.live) return v17SendAnswer(); return _oldSendAnswer ? _oldSendAnswer() : undefined; };
// Salva conversas realistas completas no histórico do gestor.
v17CompleteConversation = function(conv,ev,answer,outcome='concluído'){
  if(conv.awaitingClose) return;
  conv.awaitingClose=true; conv.outcome=outcome; conv.status='awaiting_close'; clearTimeout(conv.nagTimer); clearTimeout(conv.replyTimer);
  let bonus=outcome==='aceitou'?15:outcome==='concluído'||outcome==='concluiu'?5:outcome==='desistiu'||outcome==='perdeu paciência'?-20:0;
  const score=Math.max(0,Math.min(100,(ev?.total||60)+bonus)); conv.score=score;
  currentSession.solved++; currentSession.scores.push(score); currentSession.xp+=score;
  const oA=activeCase,oR=realistic; activeCase=conv.case; realistic=conv.realistic;
  conv.supervisorHtml=buildSupervisor(ev,answer,outcome,score)+`<div class="finishPanel"><h3>Atendimento finalizado</h3><p>Cliente não enviará mais mensagens. Clique em <b>Encerrar atendimento</b> para remover da fila.</p></div>`;
  activeCase=oA; realistic=oR;
  v21SaveConversationToSession(conv,score,outcome);
  if(V17.activeId===conv.id){ v17SelectConversation(conv.id); }
  updateHud(); playSound('finish');
};
v17CustomerAbandons = function(conv){
  if(conv.closed||conv.awaitingClose) return;
  v17AddMessage(conv,'client','Como não tive retorno, vou encerrar por aqui.');
  conv.awaitingClose=true; conv.outcome='desistiu por demora'; conv.score=25; conv.status='awaiting_close';
  currentSession.solved++; currentSession.scores.push(25); currentSession.xp+=25;
  conv.supervisorHtml='<h3>Supervisor IA • Nota 25%</h3><p>O cliente abandonou por demora no retorno. Priorize clientes com indicador vermelho e use Ocupado/Ausente quando necessário.</p>';
  v21SaveConversationToSession(conv,25,conv.outcome);
  if(V17.activeId===conv.id) v17SelectConversation(conv.id);
  updateHud();
};
// Ao finalizar a sessão, grava também conversas realistas não encerradas, evitando sumirem do painel gestor.
const v21PreviousFinishSession = finishSession;
finishSession = function(){
  if(selectedMode==='conversa' && V17.live && currentSession){
    V17.conversations.forEach(conv=>{
      if(conv.closed || conv.savedToSession) return;
      clearTimeout(conv.nagTimer); clearTimeout(conv.replyTimer);
      const lastAnswer=(conv.answerLog||[]).slice(-1)[0]||'';
      const score=conv.score || (conv.answerLog?.length ? 55 : 20);
      conv.outcome=conv.awaitingClose?conv.outcome:'sessão finalizada';
      if(!conv.supervisorHtml) conv.supervisorHtml='<h3>Supervisor IA</h3><p>Atendimento salvo porque a sessão foi finalizada antes do encerramento individual.</p>';
      if(!conv.awaitingClose){ currentSession.solved++; currentSession.scores.push(score); currentSession.xp+=score; }
      v21SaveConversationToSession(conv,score,conv.outcome);
    });
  }
  return v21PreviousFinishSession();
};
if($('sendAnswerBtn')) $('sendAnswerBtn').onclick=sendAnswer;
if($('finishBtn')) $('finishBtn').onclick=finishSession;
if($('answerBox')){
  $('answerBox').addEventListener('keydown',e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendAnswer(); } });
}
console.log('ConCrédito Simulador - V21 IA Nível 3 + histórico unificado carregada');


/* =====================================================
   V22 - BASE REAL CONCRÉDITO + IA NÍVEL 3 MAIS CONTROLADA
   - Remove categorias artificiais (Pendência/Dúvida/Autorização CTPS)
   - Usa "Situação" como descrição real do problema do cliente
   - Migra casos antigos salvos no navegador para a nova biblioteca oficial
   - Corrige cobrança indevida por demora quando o atendente acabou de responder
   - Envia tempo real de espera para o Gemini e filtra respostas incoerentes
   ===================================================== */
const V22 = { version:'v22_base_real_ia_n3_controlada' };
function v22Esc(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function v22Situation(c){ return c?.situation || c?.situacao || c?.title || 'Situação do cliente'; }
function v22Meta(c, includeProfile=false){ return `${c?.product||'Produto'} • ${v22Situation(c)} • ${c?.difficulty||'Nível'}` + (includeProfile && c?.profile ? ` • ${c.profile}` : ''); }
function v22NormalizeCase(c){
  const x = normalizeCase ? normalizeCase(c) : {...c};
  x.product = x.product === 'Crédito CLT' ? 'Crédito do Trabalhador' : x.product;
  const bad = ['Pendência','Dúvida','Solicitação','Consulta','Autorização CTPS','Erro','Aprovação','Reprovação','Objeção'];
  if(!x.situation){
    if(x.id==='clt_ctps_autorizacao' || /ctps|autoriza|carteira/i.test(`${x.title} ${x.message}`)) x.situation='Cliente tentou seguir pelo aplicativo e não conseguiu finalizar';
    else if(x.category && !bad.includes(x.category)) x.situation=x.category;
    else x.situation=x.title || 'Situação do cliente';
  }
  x.category='Situação do cliente';
  x.history=(x.history||[]).map(h=>String(h)
    .replace(/Sem autorização concluída na CTPS Digital\.?/gi,'Cliente tentou seguir pelo aplicativo, mas não conseguiu concluir.')
    .replace(/Cliente iniciou proposta de Crédito CLT\.?/gi,'Cliente iniciou uma proposta de Crédito do Trabalhador.')
    .replace(/Cliente menciona bloqueio vinculado a contrato de antecipação FGTS\.?/gi,'Cliente relata bloqueio no aplicativo do FGTS.')
  );
  if(/A Caixa informou que meu FGTS está bloqueado\. Você sabe por quê\?/i.test(x.message||'')){
    x.message='Fui consultar meu FGTS e apareceu que está bloqueado. Você sabe me dizer o motivo?';
    x.situation='Cliente viu bloqueio no aplicativo ou foi informado pela Caixa';
  }
  if(/Estou tentando autorizar na Carteira de Trabalho/i.test(x.message||'')){
    x.message='Estou tentando fazer pelo aplicativo, mas não consigo finalizar. Pode me ajudar?';
    x.situation='Cliente tentou seguir pelo aplicativo e não conseguiu finalizar';
  }
  return x;
}
(function v22MigrateCases(){
  try{
    window.CONCREDITO_CATEGORIES=['Situação do cliente'];
    if(window.CONCREDITO_DEFAULT_CASES) window.CONCREDITO_DEFAULT_CASES = window.CONCREDITO_DEFAULT_CASES.map(v22NormalizeCase);
    const flag='concredito_v22_cases_migrated';
    if(localStorage.getItem(flag)!=='1'){
      // Troca a biblioteca local por uma base limpa e padronizada. Os históricos de treinamento são preservados.
      save(KEYS.cases, (window.CONCREDITO_DEFAULT_CASES||[]).map(v22NormalizeCase));
      localStorage.setItem(flag,'1');
    } else {
      const stored=load(KEYS.cases,null);
      if(Array.isArray(stored)) save(KEYS.cases, stored.map(v22NormalizeCase));
    }
  }catch(e){ console.warn('V22 migration failed', e); }
})();

// Override: cartões e cabeçalho não mostram mais categoria artificial.
caseCard = function(c, actions=false){
  c=v22NormalizeCase(c);
  return `<div class="caseCard" data-id="${v22Esc(c.id)}"><b>${v22Esc(c.title)}</b><small>${v22Esc(v22Meta(c,true))}</small><p>${v22Esc(c.message)}</p><div class="tags">${(c.tags||[]).slice(0,5).map(t=>`<span>${v22Esc(t)}</span>`).join('')}<span>${v22Esc(c.status||'ativo')}</span></div>${actions?`<div class="actions"><button class="secondary small editCase" data-id="${v22Esc(c.id)}">Editar</button><button class="secondary small dupCase" data-id="${v22Esc(c.id)}">Duplicar</button><button class="secondary small toggleCase" data-id="${v22Esc(c.id)}">${c.status==='inativo'?'Ativar':'Inativar'}</button><button class="secondary small delCase" data-id="${v22Esc(c.id)}">Excluir</button></div>`:''}</div>`;
};
const v22OldGetCases = getCases;
getCases = function(){ return (v22OldGetCases ? v22OldGetCases() : []).map(v22NormalizeCase); };
const v22OldSetCases = setCases;
setCases = function(cases){ return v22OldSetCases((cases||[]).map(v22NormalizeCase)); };

// Corrige seleção normal para exibir Situação em vez de categoria.
const v22OldSelectCase = selectCase;
selectCase = function(id){
  v22OldSelectCase(id);
  if(activeCase){
    activeCase=v22NormalizeCase(activeCase);
    if($('clientMeta')) $('clientMeta').textContent = selectedMode==='conversa' ? `${activeCase.product} • ${v22Situation(activeCase)} • Cliente inteligente ativo` : v22Meta(activeCase,true);
    if($('historyList')) $('historyList').innerHTML=(activeCase.history||[]).map(h=>`<div class="historyLine">${v22Esc(h)}</div>`).join('')||'<p>Sem histórico.</p>';
  }
};

// Corrige seleção de conversa realista para não mostrar categoria.
if(typeof v17SelectConversation==='function'){
  const v22OldV17SelectConversation = v17SelectConversation;
  v17SelectConversation = function(id){
    v22OldV17SelectConversation(id);
    const conv=V17?.conversations?.find(c=>c.id===id);
    if(conv?.case && $('clientMeta')) $('clientMeta').textContent = v22Meta(v22NormalizeCase(conv.case));
  };
}

// Envia contexto mais correto para o Gemini.
const v22OldClientePayload = v21ClientePayload;
v21ClientePayload = function(conv, answer){
  const payload = v22OldClientePayload(conv, answer);
  const c = v22NormalizeCase(conv.case||{});
  payload.caseData = {...payload.caseData, product:c.product, category:'Situação do cliente', situation:v22Situation(c), title:c.title, message:c.message, history:c.history||[], goal:c.goal||'', ideal:c.ideal||'', criteria:c.criteria||'', hint:c.hint||''};
  const now=Date.now();
  const waitMs = conv.lastClientAt ? Math.max(0, now-conv.lastClientAt) : 0;
  const answerDelayMs = conv.lastClientAt ? Math.max(0, (conv.lastAgentAt||now)-conv.lastClientAt) : 0;
  payload.estado = {...payload.estado,
    tempoEsperaClienteMs: waitMs,
    tempoRespostaAtendenteMs: answerDelayMs,
    podeReclamarDemora: answerDelayMs > 120000,
    regraDemora: 'Só reclame de demora se tempoRespostaAtendenteMs for maior que 120000. Se o atendente respondeu há pouco, não diga que demorou.'
  };
  return payload;
};
function v22SanitizeGeminiMessage(msg, conv){
  let text=String(msg||'').trim();
  const answerDelayMs = conv?.lastClientAt && conv?.lastAgentAt ? Math.max(0, conv.lastAgentAt-conv.lastClientAt) : 0;
  const saysDelay=/demor|perdendo a confiança|perdi a confiança|falta de retorno|sem retorno|não tive retorno|ninguém.*ajud/i.test(text);
  if(saysDelay && answerDelayMs < 120000){
    const c=v22NormalizeCase(conv.case||{});
    const prod=String(c.product||'').toLowerCase();
    if(prod.includes('bolsa')) text='Entendi. Então para consultar você precisa do meu CPF, certo?';
    else if(prod.includes('refinanciamento')) text='Entendi. Quais informações do veículo você precisa para consultar?';
    else if(prod.includes('fgts')) text='Certo. Você precisa do meu CPF para verificar o bloqueio?';
    else if(prod.includes('trabalhador')) text='Entendi. Qual é o próximo passo para continuar?';
    else text='Entendi. Qual é o próximo passo agora?';
  }
  // Evita termos artificiais voltando pela IA.
  text=text.replace(/autorização na CTPS/gi,'processo pelo aplicativo')
           .replace(/pendência/gi,'etapa que ficou em aberto');
  return text;
}
const v22OldGeminiReply = v21GeminiClientReply;
v21GeminiClientReply = async function(conv, ev, answer){
  const rep = await v22OldGeminiReply(conv, ev, answer);
  if(rep && rep.text) rep.text = v22SanitizeGeminiMessage(rep.text, conv);
  return rep;
};

// Corrige o envio realista: marca o tempo da resposta antes de zerar espera e só então agenda retorno.
v17SendAnswer = function(){
  const conv=V17.conversations.find(c=>c.id===V17.activeId); if(!conv) return;
  const answer=($('answerBox')?.value||'').trim();
  if(answer.length<2){ v19ShowValidation('Digite uma resposta antes de enviar.'); return; }
  clearTimeout(conv.nagTimer);
  const answeredAt=Date.now();
  conv.lastAgentAt=answeredAt;
  conv.status='awaiting_client';
  conv.botNoticeSent=false;
  const oldActive=activeCase, oldReal=realistic; activeCase=v22NormalizeCase(conv.case); realistic=conv.realistic;
  v17AddMessage(conv,'agent',answer); conv.answerLog.push(answer); $('answerBox').value='';
  const ev=evaluate(answer,conv.case); applyRealisticState(ev,answer);
  // Depois de responder, a espera do cliente acabou. A próxima cobrança só pode nascer após nova mensagem do cliente.
  conv.lastClientAt=null;
  activeCase=oldActive; realistic=oldReal;
  $('sendAnswerBtn').disabled=true; $('answerBox').disabled=true;
  const cfg=v17DifficultyConfig(); const delay=cfg.replyMin+Math.random()*(cfg.replyMax-cfg.replyMin);
  clearTimeout(conv.replyTimer); conv.replyTimer=setTimeout(async()=>{
    if(conv.closed||conv.awaitingClose) return;
    const rep=await v21GeminiClientReply(conv,ev,answer);
    if(conv.closed||conv.awaitingClose) return;
    v17AddMessage(conv,'client',rep.text);
    if(rep.end){ v17CompleteConversation(conv,ev,answer,rep.outcome||'concluído'); }
    if(V17.activeId===conv.id && !conv.awaitingClose){ $('sendAnswerBtn').disabled=false; $('answerBox').disabled=false; $('answerBox').focus(); }
  }, delay);
};

// A cobrança só roda quando o cliente realmente está aguardando o atendente.
const v22OldScheduleNag = v17ScheduleNag;
v17ScheduleNag = function(conv){
  if(!conv || conv.status!=='awaiting_agent' || !conv.lastClientAt) return;
  return v22OldScheduleNag(conv);
};

setTimeout(()=>{ try{ fillSelects?.(); refreshAll?.(); if(selectedMode) renderQueue?.(); }catch(e){} },0);
console.log('ConCrédito Simulador - V22 Base Real + IA Nível 3 Controlada carregada');

/* =====================================================
   V23 - IA DEFINITIVA: payload completo + telemetria do controlador
   ===================================================== */
const V23={version:'v23_ia_controlador_cliente'};
const v23OldPayload=v21ClientePayload;
v21ClientePayload=function(conv,answer){
  const payload=v23OldPayload(conv,answer);
  const st=conv.realistic||{};
  payload.caseData.situation=conv.case?.situation||conv.case?.category||'';
  payload.caseData.forbiddenTopics=conv.case?.forbiddenTopics||[];
  payload.estado.tempoRespostaAtendenteMs=Math.max(0,(conv.lastAgentAt||Date.now())-(conv.lastClientAt||conv.createdAt||Date.now()));
  payload.estado.podeReclamarDemora=payload.estado.tempoRespostaAtendenteMs>=120000;
  payload.estado.humor=st.mood;
  payload.estado.confianca=st.trust;
  payload.estado.paciencia=st.patience;
  payload.estado.interesse=st.interest;
  return payload;
};
const v23OldGeminiReply=v21GeminiClientReply;
v21GeminiClientReply=async function(conv,ev,answer){
  try{
    const r=await fetch('https://backend-do-simulador-con-cr-dito-jb.vercel.app/api/cliente',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(v21ClientePayload(conv,answer))});
    if(!r.ok) throw new Error('API indisponível');
    const data=await r.json();
    if(!data||!data.message||data.ok===false) throw new Error(data?.analysis?.note||'Fallback');
    const st=conv.realistic||{};
    if(typeof data.trust==='number') st.trust=Math.max(0,Math.min(100,Math.round(data.trust)));
    if(typeof data.patience==='number') st.patience=Math.max(0,Math.min(100,Math.round(data.patience)));
    if(data.mood) st.mood=data.mood;
    if(data.stage) st.stage=data.stage;
    st.memory={...(st.memory||{}),...(data.memory||{})};
    st.turnAnalyses=st.turnAnalyses||[];
    st.turnAnalyses.push({
      turn:st.turns||0,score:data.analysis?.quality??ev.total,answer,
      entries:[
        {metric:'Análise semântica',reason:data.analysis?.note||'Resposta analisada no contexto completo.'},
        {metric:'Decisão do controlador',reason:data.controller?.decision||'não informada'},
        ...(data.analysis?.missing?.length?[{metric:'Pontos pendentes',reason:data.analysis.missing.join(', ')}]:[])
      ],
      alternative:'Responder ao objetivo do cliente com clareza, segurança e próximo passo concreto.'
    });
    st.events=st.events||[];
    st.events.push(`V23 Controlador: ${data.controller?.decision||'contextual'} | ${data.analysis?.resolution||'parcial'} | qualidade ${data.analysis?.quality??ev.total}%.`);
    return {text:String(data.message).trim(),end:!!data.end,outcome:data.outcome||'concluído'};
  }catch(err){
    conv.realistic?.events?.push?.(`Fallback local acionado: ${err.message}.`);
    return v23OldGeminiReply(conv,ev,answer);
  }
};
console.log('ConCrédito Simulador - V23 IA Controlador + Cliente carregada');
