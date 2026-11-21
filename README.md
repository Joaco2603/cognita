# Dojo Hackathon

Monorepo del proyecto construido durante el hackathon.

## Contenido

- [`claude-code-tui/`](./claude-code-tui) - plugin de Claude Code con dashboards interactivos para terminal.
- [`graphify-out/`](./graphify-out) - grafo y reportes generados del código fuente.
- [`skills/`](./skills) - skills locales del proyecto.
- [`HACKATHON.md`](./HACKATHON.md) - contexto del hackathon, criterios, línea base y checklist de entrega.

## Claude Code TUI

El plugin incluye vistas de Dashboard y Agents dentro de la sesión actual de Claude Code.

```bash
cd claude-code-tui
npm install
npm run build
npm run install:local
```

Luego inicia Claude Code con `claude` y ejecuta `/inspector` (pestaña Context con `2`) o `/inspector report` para un reporte en Markdown.

## Desarrollo

Comandos disponibles desde `claude-code-tui/`:

```bash
npm run build
npm test
npm run validate
```
