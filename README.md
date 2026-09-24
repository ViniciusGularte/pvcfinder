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
- `/api/pvc/shops`
- `/api/shops`

Observacao:

- O endpoint local busca os dados ao vivo e cai para `data/shops-snapshot.json`
  se a origem do PVC estiver indisponivel.
- Supabase, Vercel Functions, cron, push notifications e migrations foram
  removidos. Alertas ficam apenas no armazenamento local do navegador.
- Na VPS do TheyAsked, o modulo roda em `/pvc` e consome `/api/pvc/shops`.

Texturas dos itens:

- Gere ou atualize o mapa local de texturas com `npm run textures:generate`
- O arquivo gerado fica em `data/item-textures.js`
