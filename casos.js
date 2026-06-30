window.CONCREDITO_CASES = [
  {
    id:'parcelas_menores', name:'Carlos', type:'Objeção: parcela alta', profile:'Cliente cauteloso',
    message:'Eu recebi uma proposta de R$ 5.600,00 em 18x de R$ 477,77, mas queria parcelas menores.',
    stage:'negociacao', context:'vendas', difficulty:1,
    history:[['Hoje - Vendas','Cliente recebeu proposta de R$ 5.600,00 em 18x de R$ 477,77.'],['Agora - Cliente','Solicitou parcelas menores.']],
    hint:'Entenda a objeção, acolha e pergunte qual parcela ficaria confortável para fazer nova simulação.',
    suggested:'Entendo, Carlos! Sem problemas. Vamos buscar uma proposta que faça mais sentido para você. Qual valor de parcela ficaria mais confortável no seu orçamento? Com essa informação, faço uma nova simulação e verifico as melhores opções disponíveis.',
    official:['entendo','sem problemas','proposta','parcela confortável','orçamento','nova simulação','melhores opções']
  },
  {
    id:'valor_maior', name:'Mariana', type:'Objeção: valor baixo', profile:'Cliente objetiva',
    message:'O valor ficou muito baixo, eu precisava de pelo menos R$ 10.000.',
    stage:'negociacao', context:'vendas', difficulty:2,
    history:[['Hoje - Vendas','Cliente fez simulação, mas não ficou satisfeita com o valor liberado.'],['Agora - Cliente','Disse que precisava de pelo menos R$ 10.000.']],
    hint:'Mostre que vai buscar alternativa. Não prometa aprovação; ofereça verificar maior valor ou outra modalidade.',
    suggested:'Entendo! Vou verificar se existe alguma opção que libere um valor maior para você. Caso não seja possível nesta modalidade, também posso consultar outras alternativas de crédito. Só um instante que já verifico.',
    official:['entendo','verificar','valor maior','opção','modalidade','alternativas de crédito','já verifico']
  },
  {
    id:'vou_pensar', name:'João', type:'Objeção: vou pensar', profile:'Cliente indeciso',
    message:'Vou pensar e depois eu retorno.',
    stage:'recuperacao', context:'vendas', difficulty:1,
    history:[['Hoje - Vendas','Cliente recebeu explicação sobre a proposta.'],['Agora - Cliente','Informou que vai pensar e retornar depois.']],
    hint:'Não pressione. Pergunte se ficou alguma dúvida e deixe aberta a possibilidade de nova simulação.',
    suggested:'Entendo, mas você possui alguma dúvida sobre a contratação? Se surgir qualquer dúvida ou quiser que eu faça uma nova simulação, é só me chamar. Estarei à disposição para ajudar.',
    official:['entendo','dúvida','contratação','nova simulação','à disposição','ajudar']
  },
  {
    id:'interesse_inicial', name:'Fernanda', type:'Interesse inicial', profile:'Cliente curiosa',
    message:'Olá, queria saber como funciona o empréstimo com carteira assinada.',
    stage:'captacao', context:'vendas', difficulty:1,
    history:[['Agora - Cliente','Perguntou sobre empréstimo para quem tem carteira assinada.']],
    hint:'Explique de forma simples e avance para a simulação solicitando as informações necessárias.',
    suggested:'Olá, Fernanda! Funciona como uma simulação de crédito para quem trabalha com carteira assinada. Eu posso verificar as opções disponíveis para você. Para começar, me confirme por favor seu CPF e a média da sua renda mensal.',
    official:['olá','carteira assinada','simulação','opções disponíveis','cpf','renda']
  },
  {
    id:'medo_golpe', name:'Patrícia', type:'Objeção: medo de golpe', profile:'Cliente desconfiada',
    message:'Isso é golpe? Estou com medo de passar meus dados.',
    stage:'seguranca', context:'vendas', difficulty:2,
    history:[['Hoje - Cliente','Demonstrou interesse, mas ficou insegura sobre o processo.']],
    hint:'Passe segurança, explique que a ConCrédito é uma empresa de consignados e que os dados são usados apenas para simulação/análise.',
    suggested:'Patrícia, entendo sua preocupação. A ConCrédito Consignados trabalha com simulações de crédito e seus dados são utilizados apenas para consultar as opções disponíveis com segurança. Posso te explicar cada etapa antes de seguirmos, tudo bem?',
    official:['entendo','preocupação','concrédito','simulações de crédito','dados','segurança','explicar cada etapa']
  },
  {
    id:'juros_altos', name:'Roberto', type:'Objeção: juros altos', profile:'Cliente comparando',
    message:'Achei os juros altos, acho que vou procurar outro lugar.',
    stage:'negociacao', context:'vendas', difficulty:2,
    history:[['Hoje - Vendas','Cliente recebeu proposta e questionou taxa/juros.']],
    hint:'Acolha a objeção, explique que pode revisar opções e tentar encontrar uma condição mais adequada.',
    suggested:'Entendo, Roberto. Podemos revisar a simulação para tentar encontrar uma condição que fique mais adequada para você. Às vezes o prazo ou o valor solicitado influencia bastante na parcela. Quer que eu verifique uma nova opção?',
    official:['entendo','revisar','simulação','condição','prazo','valor solicitado','nova opção']
  },
  {
    id:'concorrente', name:'Aline', type:'Objeção: outro banco', profile:'Cliente comparando proposta',
    message:'Outro banco me ofereceu uma condição melhor.',
    stage:'concorrencia', context:'vendas', difficulty:3,
    history:[['Hoje - Cliente','Está comparando propostas antes de decidir.']],
    hint:'Não critique concorrente. Peça detalhes da condição e ofereça verificar uma alternativa.',
    suggested:'Entendo, Aline. Para eu tentar te ajudar melhor, você pode me dizer qual foi a condição oferecida, como valor liberado, parcela e prazo? Assim consigo comparar com cuidado e verificar se temos uma alternativa mais interessante para você.',
    official:['entendo','condição oferecida','valor liberado','parcela','prazo','comparar','alternativa']
  },
  {
    id:'sumiu_whatsapp', name:'Lucas', type:'Recuperação: cliente sumiu', profile:'Cliente ocupado',
    message:'Visualizou a proposta e não respondeu mais.',
    stage:'recuperacao', context:'vendas', difficulty:2,
    history:[['Ontem - Vendas','Proposta enviada ao cliente.'],['Hoje - Sistema','Cliente visualizou e não respondeu.']],
    hint:'Faça uma retomada leve, sem cobrança, oferecendo ajuda e nova simulação se necessário.',
    suggested:'Lucas, passando para saber se ficou alguma dúvida sobre a proposta que te enviei. Se a parcela ou o valor não ficaram ideais, posso fazer uma nova simulação e buscar uma opção que faça mais sentido para você.',
    official:['dúvida','proposta','parcela','valor','nova simulação','opção','sentido para você']
  },
  {
    id:'sem_tempo', name:'Bruna', type:'Objeção: sem tempo', profile:'Cliente apressada',
    message:'Agora não consigo ver isso, estou sem tempo.',
    stage:'recuperacao', context:'vendas', difficulty:1,
    history:[['Hoje - Cliente','Cliente estava em atendimento, mas disse estar sem tempo.']],
    hint:'Respeite o tempo do cliente e combine um retorno.',
    suggested:'Sem problemas, Bruna. Para não te atrapalhar, posso te chamar em outro horário. Qual período fica melhor para você: manhã, tarde ou noite?',
    official:['sem problemas','outro horário','qual período','manhã','tarde','noite']
  },
  {
    id:'quitacao_encaminhamento', name:'Rafael', type:'Encaminhamento: quitação', profile:'Cliente direto',
    message:'Quero quitar meu contrato antecipadamente.',
    stage:'encaminhamento', context:'vendas_suporte', difficulty:1,
    history:[['Agora - Cliente','Solicitou quitação antecipada de contrato já existente.']],
    hint:'Vendas não calcula quitação. Direcione ao suporte de forma educada e segura.',
    suggested:'Como você deseja realizar a quitação antecipada do seu contrato, vou direcionar o seu atendimento ao setor responsável, que prestará todo o suporte necessário e dará continuidade à sua solicitação. Tudo bem?',
    official:['quitação antecipada','direcionar','setor responsável','suporte necessário','continuidade','tudo bem']
  }
];
