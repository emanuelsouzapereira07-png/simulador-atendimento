# Academia de Vendas ConCrédito — V15

Versão com visual original preservado e melhorias implementadas:

- Foco em Vendas.
- Casos comerciais: parcela menor, valor maior, vou pensar, concorrente, juros, medo de golpe etc.
- Quitação adaptada para encaminhamento ao Suporte.
- Botão de Resposta Oficial removido antes da avaliação.
- Resposta recomendada aparece apenas após o vendedor responder.
- Campo de nome do vendedor e time de vendas.
- Times: Savana, Santo Crédito, Construindo Sonhos, Tropa de Elite e Esquadrão Fênix.
- Níveis: Aprendiz de Suporte, Atendente em Treinamento, Atendente Júnior, Atendente Pleno, Atendente Sênior, Especialista em Atendimento, Supervisor de Atendimento e Instrutor ConCrédito.
- Ranking local para vendedores.
- Painel gestor em `admin.html`.
- Exportação CSV/Excel e impressão PDF.
- Backend Gemini preparado.
- Supabase preparado para salvar resultados online.

## Login do painel gestor

Usuário: `suporte`

Senha: `suporte123`

## Frontend no GitHub Pages

Enviar para o repositório do site:

- `index.html`
- `style.css`
- `script.js`
- `casos.js`
- `admin.html`
- `admin.js`
- `README.md` opcional

## Backend na Vercel

Enviar para o repositório da API:

- `api/`
- `prompts/`
- `package.json`
- `vercel.json`
- `.env.example` opcional

## Variáveis na Vercel

Para Gemini:

- `GEMINI_API_KEY`

Para salvar histórico online depois que configurarmos o Supabase:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Banco de dados Supabase

Tabela esperada: `trainings`.

Depois eu posso ajudar a criar a tabela no Supabase passo a passo.

## Atualização de casos comerciais
Foram adicionados casos de vendas relacionados a:
- valor baixo e cliente querendo esperar;
- dúvida sobre desconto do FGTS em caso de demissão;
- proposta melhor aparecendo no app da Carteira de Trabalho;
- cliente dizendo que vai pensar com investigação de objeção;
- cliente CLT identificado na Dataprev com oferta de outros produtos.
