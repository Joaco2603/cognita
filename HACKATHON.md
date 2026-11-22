# Contexto del hackathon: Dojo AI Hackathon

Este repo es la entrega del equipo **Repository Syndicate** para el Dojo AI Hackathon.
Todo el trabajo debe tomar decisiones pensando en los criterios de evaluación y en
que el producto se va a **vender en Dojo Marketplace** después del evento.

## Datos clave

| Item | Valor |
| --- | --- |
| Fechas | 20 al 22 de noviembre de 2026 (hora de Costa Rica, UTC−6) |
| Entrega | **Domingo 22 nov, 23:59 UTC−6**, desde Dojo. Solo el capitán entrega |
| Evaluación | 23 nov. Resultados en la página del hackathon |
| Modalidad | Híbrido. Encuentro presencial opcional: vie 20, WeWork Plaza Real Cariari |
| Equipo | Joaquín Pappa (capitán), Jeffry VF, Andrés Calvo. Queda 1 lugar libre |
| Premios | $1,000 en dos tracks. Por track: 1er lugar $300, 2do lugar $200 |
| Marketplace | Lo entregado se publica automáticamente en Dojo Marketplace. El equipo se queda con el 85% de cada venta |

## Track elegido: 01 · Build for Builders

> Herramientas para quienes construyen. Creá un MCP, un plugin, un skill o un template
> que le ahorre horas a otro builder.

Este proyecto (un plugin de Claude Code) encaja directamente en este track.

### Criterios de evaluación

| Criterio | Peso | Qué implica para este repo |
| --- | --- | --- |
| Utilidad real para otros builders | 30% | Debe resolver un dolor concreto y demostrable, no solo mostrar datos |
| Potencial de venta en el Marketplace | 25% | Propuesta de valor clara, público definido, algo por lo que se pague |
| Calidad técnica y que funcione | 25% | Build, tests y `claude plugin validate` en verde; sin crashes en Windows/macOS/Linux |
| Documentación y facilidad de instalación | 20% | Instalación en pocos pasos, README con capturas/GIF, troubleshooting |

## Reglas que afectan el trabajo

- **Usar herramientas de AI coding** y documentar en la entrega cómo se usaron y qué construyó el equipo.
- **Proyecto existente:** se evalúa solo el progreso hecho entre el 20 y el 22 de noviembre.
  Hay que distinguir el trabajo previo del avance durante el hackathon (ver abajo).
- **Verificar enlaces** de la entrega (repo, demo, video) antes de enviar: se publica tal cual.
- Formatos aceptados en el Marketplace: servidores MCP, plugins y skills, agentes, repos y
  templates, apps y micro SaaS.

## Estado inicial (línea base)

Estado del repo al comenzar el hackathon, commit `4ebc601` del 20 nov 2026:

- `claude-code-tui/`: plugin "Workspace Dashboard" v0.1.0 (~620 líneas TypeScript).
  - Comando `/inspector` que abre un panel dentro de la sesión de Claude Code.
  - Pestaña **Dashboard**: lista de workspaces con búsqueda (`~/programming` o
    `CLAUDE_CODE_WORKSPACES_DIR`) y snapshots de `/context`.
  - Pestaña **Agents**: agentes activos/inactivos de la sesión actual, tokens y estado,
    y botón **New agent** para lanzar un subagente en el workspace elegido.
  - Instalación local con `npm run install:local` (copia a `~/.claude/skills/workspace-dashboard`).
- `graphify-out/`: grafo y reporte generados del código.
- `skills/`: skills locales (`rust-terminal-ui`, `file-size-discipline`).

Todo lo que se agregue después de `4ebc601` cuenta como avance del hackathon.
Registrarlo en la sección siguiente para la entrega.

## Avance durante el hackathon

<!-- Agregar aquí cada mejora relevante con fecha y quién la hizo. -->

- **2026-11-20 · Medición de lo que carga la sesión (v0.2.0).**
  - Nueva pestaña Context: medidor de la ventana, desglose por categoría, archivos CLAUDE.md/memoria, MCP servers (herramientas cargadas/diferidas y llamadas), skills, agentes y secciones del system prompt, incluidas las que inyectan otros plugins.
  - Sección "Loaded but unused": tokens gastados en MCP servers y skills que la sesión nunca usó.
  - `/inspector report [full]` genera un reporte en Markdown; el status line muestra `ctx % · $costo`.
  - Hooks de solo observación (`tool.call`, `skill.prompt`, `prompt.compose`, `prompt.context`, `session.measure`) protegidos con `try/catch`.
  - Instalación de un paso vía `.claude-plugin/marketplace.json`; README del plugin con uso, configuración, desarrollo y troubleshooting.
  - Compatibilidad con Windows (rutas, descubrimiento de workspaces, tests). Tests: 18 de UI (`claude plugin test`) y 12 unitarios de Node, todos en verde.

- **2026-11-21 · Validación con una sesión real y "Biggest levers".**
  - Probado con `claude -p "/inspector report" --plugin-dir ./claude-code-tui` sobre una sesión real: 34.8k / 200k tokens, 9 MCP servers, 59 skills.
  - Bug detectado con datos reales: las categorías diferidas contaban dentro de la ventana (aparecía 163%). Ahora se listan aparte ("outside the window until loaded").
  - Nueva sección "Biggest levers": acciones concretas ordenadas por ahorro. Ejemplo real: "Disable plugin `cloudflare` (16 skills, none used): frees ~1,080 tokens".
  - Skills agrupadas por origen (plugin o settings); el reporte limita las listas largas a 15 filas y conserva los totales.
  - Tests: 19 de UI y 16 unitarios, todos en verde.
- **2026-11-21 · "Since last session" (v0.3.0).**
  - Cada medición se guarda por proyecto en `$.store`; la siguiente sesión muestra qué cambió en lo que se carga antes del primer mensaje (MCP servers, skills por origen, archivos de instrucciones, categorías, modelo).
  - Probado en sesiones reales: la segunda sesión reporta "unchanged"; con `--strict-mcp-config` reporta "-3,377" y los servidores MCP que desaparecieron.
  - Aparece en `/inspector report` y en el panel ("SINCE LAST SESSION").
  - Tests: 22 de UI y 19 unitarios, todos en verde.
- **2026-11-21 · Alertas al iniciar, presupuesto y reporte JSON (v0.4.0).**
  - Al iniciar una sesión interactiva se mide el loadout en segundo plano; un toast avisa si creció 2,000 tokens o más (configurable) o si supera el presupuesto, y nombra la causa principal ("mostly MCP server linear (new)").
  - `CLAUDE_INSPECTOR_BUDGET` (acepta `30k`, `1.5M`): el reporte dice si lo que carga antes del primer mensaje cabe en el presupuesto.
  - La status line muestra el cambio contra la sesión anterior (`+3.4k vs last`).
  - `/inspector report json` para scripts y CI. Probado en una sesión real: baseTokens 33,828 contra un presupuesto de 20k.
  - Tests: 24 de UI y 24 unitarios, todos en verde.
- **2026-11-21 · Historial por proyecto (v0.5.0).**
  - `/inspector history`: tendencia de las últimas 20 sesiones del proyecto con sparkline, cambio total, sesiones sobre el presupuesto y una fila por sesión.
  - Probado en sesiones reales: `█▁ 30k to 34k`, "-3,377 tokens" al quitar los MCP servers con `--strict-mcp-config`.
  - Tests: 25 de UI y 27 unitarios, todos en verde.
- **2026-11-21 · Plan de recorte (v0.6.0).**
  - `/inspector trim`: cada palanca como un paso con su comando exacto (`claude plugin disable <plugin> --scope local`, o `/mcp` → Disable para un servidor), total acumulado y cuántos pasos hacen falta para entrar en el presupuesto.
  - Verificado que `claude plugin disable cloudflare --scope local` resuelve `cloudflare@cloudflare` y solo escribe `.claude/settings.local.json` del proyecto; el comando para deshacer también funciona.
  - Sesión real: 33,828 tokens con presupuesto de 30k; el plan libera ~1,665 y avisa que sigue ~2,163 por encima.
  - Tests: 26 de UI y 29 unitarios, todos en verde.

- **2026-11-21 · Cognita: qué puede hacer el agente (v0.7.0).**
  - Rebrand a **Cognita** (plugin `cognita`, comando `/cognita`; `/inspector` queda como alias). Ícono del plugin y licencia MIT.
  - Nueva vista **Access**: le pregunta al sistema de permisos de Claude Code qué respondería ante 8 acciones de muestra (shell, editar, web, git push, `rm -rf`, leer `.env`, leer llaves SSH, escribir fuera del proyecto) **sin ejecutar nada**, y marca las riesgosas que corren sin preguntar. También lista herramientas (built-in y MCP por servidor), reglas allow/ask/deny por origen, modo de permisos, hooks de settings y plugins.
  - `/cognita access` y `/cognita access json`: el mismo análisis en Markdown o JSON.
  - Nueva vista **Overview**: contexto, acceso y agentes en una sola pantalla, con advertencias primero. Barra lateral simplificada (proyecto, modelo, vistas 1–4) y línea de atajos al pie de cada vista. Se quitó la lista de workspaces, que no aportaba al objetivo.
  - Probado en sesiones reales: `/cognita access` detectó "1 risky action runs without asking: read .env secrets" y 14 hooks; con `--settings` que agrega `deny: Read(./.env)` la fila pasa a "○ blocked". Instalación local probada desde cero (reemplaza la versión anterior `workspace-dashboard`).
  - Bug real: el motor se negaba a cargar el módulo si `$` se pasaba a funciones internas; se reorganizó `register.ts` en funciones de nivel superior con un objeto de estado.
  - Tests: 27 de UI y 37 unitarios, todos en verde; `claude plugin validate` en verde, también con `--profile directory`.

## Cómo usamos AI coding

- **Herramienta:** Claude Code (CLI) en todo el ciclo: diseño, implementación en TypeScript, tests, documentación y pruebas funcionales.
- **Qué hizo el AI:** escribió la mayor parte del código (`src/*.ts`), los tests (`tests/`), los README y este registro, a partir de la dirección del equipo. Consultó los tipos del motor de plugins (`claude-code.d.ts`) para encontrar APIs como `$.tool.check` y `$.settings.read`, en las que se basa la vista Access.
- **Qué hizo el equipo:** definió el producto (ver todo lo que el agente tiene cargado y lo que puede hacer), priorizó con los criterios de evaluación, revisó cada cambio y decidió qué entraba.
- **Cómo se validó:** cada función se probó en sesiones reales con `claude -p "/cognita …" --plugin-dir ./claude-code-tui`, además de `npm test` y `claude plugin validate`. Esas pruebas encontraron bugs que los tests con mocks no veían (categorías diferidas que daban 163%, el módulo que el motor no cargaba).
- **Trazabilidad:** un PR por versión (#8 a #13) con su descripción; cada entrada de arriba dice qué cambió y cómo se probó.

## Checklist de entrega

- [x] Nombre comercial y descripción de una línea pensada para el Marketplace
- [x] README con propuesta de valor, salida real, instalación y troubleshooting (falta GIF)
- [ ] Instalación probada desde cero en Windows, macOS y Linux (Windows probado; falta macOS y Linux)
- [x] `npm run build`, `npm test` y `npm run validate` en verde
- [x] Sección "Cómo usamos AI coding" en la entrega
- [x] Diferencia entre línea base y avance del hackathon documentada
- [ ] Video demo corto (1 a 2 min)
- [ ] Enlaces verificados; el capitán envía antes del dom 22 nov 23:59 UTC−6
