# Frontend — Central ConCrédito v14

Arquivos do simulador para publicar no GitHub Pages ou em hospedagem estática.

## O que foi incluído

- 3 modos: Plantão, Simulação Realista e Treinamento.
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


Atualização final:
- Removido o time Vendas.
- O jogador não escolhe produto antes de iniciar; os casos vêm misturados.
- Dificuldades alteradas para Júnior, Pleno e Sênior.
- Biblioteca de casos removida da área do colaborador e substituída por Como jogar.
- Simulação Realista refeita com confiança, paciência e interesse do cliente. Respostas ruins podem gerar desconfiança, pedido de humano ou desistência.
- Enter envia a resposta e Shift+Enter quebra linha.
- Ao voltar para a Home e entrar novamente, o atendimento anterior é limpo.
