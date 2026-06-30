# Central ConCrédito — Simulador de Vendas V15

Esta versão mantém o visual original da V14 e altera apenas o fluxo solicitado para o setor de vendas.

## Alterações implementadas

- Foco alterado de Suporte para Vendas.
- Removido o botão **Resposta oficial** antes da avaliação.
- A resposta recomendada aparece somente após o vendedor responder e receber avaliação.
- Removidos os casos de pagamento devolvido e demais casos exclusivos do suporte.
- Adicionados casos comerciais:
  - cliente quer parcelas menores;
  - cliente quer valor maior;
  - cliente vai pensar;
  - interesse inicial;
  - medo de golpe;
  - juros altos;
  - concorrente;
  - cliente sumiu;
  - cliente sem tempo.
- Quitação adaptada como encaminhamento ao suporte.
- Supervisor Local ajustado para avaliar negociação, condução, empatia, segurança e recuperação comercial.
- Backend preparado para Gemini via Vercel usando `GEMINI_API_KEY`.

## Publicação

### Frontend GitHub Pages
Envie para o repositório do site:

- `index.html`
- `style.css`
- `script.js`
- `casos.js`
- `README.md`

### Backend Vercel
Envie para o repositório da API:

- `api/`
- `prompts/`
- `package.json`
- `vercel.json`
- `.env.example`

Na Vercel, adicione a variável:

`GEMINI_API_KEY`

com a chave do Gemini.
