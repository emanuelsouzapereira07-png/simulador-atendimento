# Central ConCrédito — Simulador Inteligente de Atendimento V14 Enterprise

Esta versão transforma a V13 em uma plataforma de treinamento mais completa para o suporte da ConCrédito.

## O que foi implementado

- Banco de casos separado em `casos.js`.
- Mais casos reais de suporte: pagamento devolvido, reprovação, quitação, baixa de quitação, golpe, assinatura, seguro desemprego, boletos, CTPS, operação manual, pagamento não recebido e FGTS.
- Chat estilo WhatsApp.
- Perfis de clientes: apressado, ansioso, confuso, formal, desconfiado, irritado etc.
- Sistema de níveis, XP e melhor média em `localStorage`.
- Relatório final com histórico do plantão.
- Exportação do relatório em TXT.
- Configuração de IA real via backend.
- Backend Node.js pronto para Vercel em `api/analisar.js`.
- Prompt do Supervisor IA em `prompts/supervisor.js`.
- Fallback local caso a IA real não esteja configurada.

## Como testar offline

Abra o arquivo `index.html` no navegador.

Por padrão, o simulador usa a IA local. Ela não precisa de internet nem API Key.

## Como usar IA real com OpenAI

1. Publique este projeto na Vercel.
2. Configure a variável de ambiente:

```txt
OPENAI_API_KEY=sua_chave_da_openai
```

3. Opcionalmente configure:

```txt
OPENAI_MODEL=gpt-4.1-mini
```

4. Depois de publicar, copie a URL da API:

```txt
https://seu-projeto.vercel.app/api/analisar
```

5. No simulador, clique em **Configurações**, cole a URL do backend e marque **Usar IA real via backend**.

## Importante

Nunca coloque a API Key dentro do JavaScript do frontend. A chave deve ficar apenas na Vercel, nas variáveis de ambiente.

## Arquivos principais

- `index.html`: estrutura da interface.
- `style.css`: identidade visual e layout.
- `script.js`: lógica do simulador, fila, pontuação, XP, relatório e integração.
- `casos.js`: banco de casos oficiais.
- `api/analisar.js`: backend para OpenAI.
- `prompts/supervisor.js`: prompt do Supervisor IA.
