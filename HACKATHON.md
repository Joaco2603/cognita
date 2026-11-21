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
  - `/inspector report [full]` genera un reporte en Markdown; el status line muestra `ctx % · # Contexto del hackathon: Dojo AI Hackathon

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

.
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

## Checklist de entrega

- [ ] Nombre comercial y descripción de una línea pensada para el Marketplace
- [ ] README con propuesta de valor, captura o GIF, instalación y troubleshooting
- [ ] Instalación probada desde cero en Windows, macOS y Linux
- [ ] `npm run build`, `npm test` y `npm run validate` en verde
- [ ] Sección "Cómo usamos AI coding" en la entrega
- [ ] Diferencia entre línea base y avance del hackathon documentada
- [ ] Video demo corto (1 a 2 min)
- [ ] Enlaces verificados; el capitán envía antes del dom 22 nov 23:59 UTC−6
