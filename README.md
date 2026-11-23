# Arthur Alvarez — Portfolio

Portfolio personal construido con React, Vite y TypeScript, con presencia de Discord/Spotify en tiempo real a través de Lanyard.

## Desarrollo local

```bash
npm install
npm run dev
```

El ID de Discord está preconfigurado como valor público en `src/data/portfolio.ts`. Para cambiarlo, copia `.env.example` a `.env.local` y ajusta `VITE_DISCORD_USER_ID`.

Para que el estado de Discord aparezca, la cuenta debe unirse al [servidor de Lanyard](https://discord.gg/UrXF2cfJ7F). La presencia se conecta desde el navegador; no se necesita token de bot ni backend.

## Personalización

- Datos personales, proyectos, habilidades y experiencia: `src/data/portfolio.ts`.
- Textos en español e inglés: `src/i18n/translations.ts`.
- Estilos y responsive: `src/styles.css`.

## Producción

```bash
npm run build
npm run preview
```

`vercel.json` incluye el rewrite de SPA para que `/projects` funcione también al abrir la ruta directamente.
