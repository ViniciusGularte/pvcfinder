# pvcfinder

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
- `/api/shops`

Observacao:

- O endpoint local tenta buscar os dados ao vivo e, se falhar, usa o snapshot salvo em `data/shops-snapshot.json`.

Texturas dos itens:

- Gere ou atualize o mapa local de texturas com `npm run textures:generate`
- O arquivo gerado fica em `data/item-textures.js`
