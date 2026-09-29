# pvcfinder

The mod UI uses Minecraft's native client GUI toolkit, built directly in Java on top of the Screen system.

## Rodando localmente

Requisitos:

- Node.js 18 ou superior

Comandos:

```bash
npm run dev
```

Servidor local:

- http://127.0.0.1:3000

Rotas importantes:

- `/`
- `/mods`
- `/grveye/` (servico GRV Eye na porta interna 8080)
- `/api/pvc/shops`
- `/api/shops`

Observacao:

- O endpoint local busca os dados ao vivo e cai para `data/shops-snapshot.json`
  se a origem do PVC estiver indisponivel.
- Supabase, Vercel Functions, cron, push notifications e migrations foram
  removidos. Alertas ficam apenas no armazenamento local do navegador.
- Na VPS do TheyAsked, o modulo roda em `/pvc` e consome `/api/pvc/shops`.
- O GRV Eye roda como um segundo processo na mesma VPS e e publicado pelo Nginx em `/grveye/`.

## GRV Eye

O modulo em `grv-eye/` monitora as posicoes publicadas pelo Squaremap do PVC,
grava o historico em SQLite e oferece selecao de area, watches e trilhas de
jogadores. Para testar com jogadores simulados:

```bash
npm run grveye:install
npm run grveye:dev
```

Abra `http://127.0.0.1:8080/grveye/`. A configuracao de producao e o bloco de
proxy da VPS estao em `grv-eye/README.md`.

Texturas dos itens:

- Gere ou atualize o mapa local de texturas com `npm run textures:generate`
- O arquivo gerado fica em `data/item-textures.js`
