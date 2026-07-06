# Frontend — Central ConCrédito v14

Arquivos do simulador para publicar no GitHub Pages ou em hospedagem estática.

## O que foi incluído

- 3 modos: Plantão, Conversa IA e Treinamento.
- Painel de Casos protegido por senha fixa interna.
- Painel Gestor protegido por senha fixa interna.
- Produtos: Crédito CLT, FGTS, INSS, Financiamento de Veículos, Refinanciamento de Veículos e Bolsa Família.
- Cadastro, edição, exclusão, ativação/inativação e duplicação de casos.
- Importação de casos por CSV/JSON.
- Exportação de casos por CSV/JSON.
- Histórico de alterações local.
- Central de notificações local.
- Estatísticas por caso no Painel Gestor.
- Biblioteca de casos pesquisável.

## Como subir no GitHub Pages

Envie todos os arquivos desta pasta para o repositório do frontend:

- `index.html`
- `style.css`
- `app.js`
- `cases.js`
- `README.md`

Depois ative o GitHub Pages no repositório.

## Observação importante

Esta versão funciona localmente usando `localStorage` do navegador. Isso permite testar sem banco de dados.
Para dados compartilhados entre computadores, use o backend da pasta `Backend` com Supabase.
