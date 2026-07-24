# EX Energia — App (v2, reconstruído do zero)

Reconstrução completa do front-end, sem nenhuma conexão com banco de dados no momento.
Todos os dados vivem em memória (zeram ao recarregar a página) — servem só para você
validar a estrutura das telas antes de reconectarmos a um banco.

## Rodar localmente
```
npm install
npm run dev
```
Abre em http://localhost:5173

## Publicar (Vercel Drop, sem GitHub)
1. Rode `npm run build` (gera a pasta `dist/`)
2. Vá em vercel.com/new → arraste a pasta `dist/` (ou o projeto inteiro, se preferir que a Vercel rode o build)

## Estrutura de telas (igual à anterior)
- Painel
- Associações (+ Nova associação)
- Unidades geradoras (+ Nova unidade)
- Uma aba por associação cadastrada (aparece automaticamente na barra lateral)
- Clientes EX Energia (+ Novo cliente — botões de importação/robô ficam desabilitados por enquanto)
- Geração & Créditos
- Conflitos

## Próximo passo
Quando você validar que a estrutura está do jeito que quer, conectamos de novo a um banco
(Supabase ou outro, sua escolha) e os dados passam a ser salvos de verdade.
