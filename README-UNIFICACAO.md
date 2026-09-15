# SAHMT — integração nativa

Versão candidata; ler `docs/IMPLANTACAO.md` antes de publicar.

Fontes das páginas em `ui/templates/` e nos arquivos JS/CSS originais. O shell está em `core/app.js`, o isolamento em `core/runtime.js` e a autenticação em `auth/shared-auth.js`. Treinamentos possui frontend nativo e API Apps Script própria na pasta do módulo.

```sh
npm ci
npm run build
npm test
npm run serve
```

`core/views/` e os redirecionamentos são gerados. Edite as fontes e reconstrua. O pacote é estático e aproveita o mesmo GitHub Pages.
