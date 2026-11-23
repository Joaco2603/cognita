# Cognita: guion del anuncio (español)

Enfoque: el contexto de tu agente de IA. Lo que entra a la ventana antes de que escribas, lo que nunca se usa y la presión que eso pone sobre la atención del modelo.

Duración: 33 a 36 s · 1920×1080 · música y efectos, textos en pantalla en español, sin voz.
Forma: un zoom continuo hacia el panel de Cognita (guion C), con una grabación nueva en Claude Code y en Claude Desktop.

## Hook (0–3 s)

Pantalla negra. Un contador sube de 0 a 35.000 mientras se escribe:

> **Tu agente ya gastó 35.000 tokens.**
> **Y todavía no escribiste nada.**

Corte duro a la sesión real con `/cognita`, y la cámara empieza a entrar al panel.

Alternativas de hook, para probar en redes:

- "La IA no se olvida de lo que le dijiste. Lo pierde entre todo lo que le cargaste."
- "¿Cuánto de tu contexto es ruido? Cognita te lo dice."
- Versión en pregunta (borrador del equipo): "¿Usás agentes de IA y no entendés por qué gastan tantos tokens o te dan peores resultados?" Es más genérica y en 3 s no alcanza a responderse sola. Mejor como segundo texto, después del contador.

## Problema y presentación (los tres textos del equipo, ajustados)

Van en pantalla, sin voz, en el tramo de 3 a 8 s. Cada uno se ve junto a lo que lo prueba:

1. Problema: "Herramientas que cargan tokens antes de empezar." (se ve el desglose de Context)
2. Problema: "Contexto que nunca se usa." (se ve "cargado pero nunca usado")
3. Problema: "Y lo importante se pierde entre tanta información." (se ve Pressure)
4. Presentación: "Cognita: ver, recortar y proteger el contexto de tu agente."

Notas de redacción:

- No usar "orquestar": Cognita no orquesta agentes. Mide, recorta (`trim`, `hold`) y protege (tags, compactación). `split` solo sugiere repartir el plan.
- "Peores resultados" va respaldado por Chroma (Context Rot) y Liu et al. (Lost in the Middle). Citarlos en la descripción, no en pantalla.

## Beats

| Tiempo | Qué se ve | Texto en pantalla |
| --- | --- | --- |
| 0–3 s | Contador 0 → 35.000 sobre negro | Tu agente ya gastó 35.000 tokens. Y todavía no escribiste nada. |
| 3–7 s | `/cognita` en Claude Code, se abre el panel (Overview) | Cognita: ver, recortar y proteger el contexto de tu agente. |
| 7–11 s | Zoom a Context: "cargado pero nunca usado" | 9.100 tokens cargados que nunca se usaron. |
| 11–15 s | `/cognita trim` y `/cognita hold`: el comando y los tokens que libera | Un comando para recortarlos. Y otro para deshacerlo. |
| 15–19 s | Pressure: medidor y tags con su parte de la atención | Cuanto más cargás, menos atención recibe lo importante. |
| 19–23 s | `/cognita compact`: tags marcados como conservados, reescritos o perdidos | Compactá sin perder lo que importa. |
| 23–27 s | Access: leer `.env` corre sin preguntar, una regla deny lo bloquea | Qué puede hacer tu agente, sin ejecutar nada. |
| 27–30 s | Chips: policy `.cognita.json` · `supply` · `cost` | Para equipos: policy, supply chain y costo en dólares. |
| 30–33 s | La misma vista Pressure en Claude Desktop, con el plan al lado | En la terminal y en Claude Desktop. |
| 33–36 s | Logo y línea de instalación | `/plugin install cognita@cognita` |

Las features que más pesan en la evaluación, en orden: Context (lo que se carga y no se usa), trim y hold, Pressure con tags, Access, y las de equipos. Windows, macOS y Linux con CI en las tres va en la descripción del video, no en pantalla.

Los números (35.000, 9.100) son de la toma anterior. Se reemplazan por los de la grabación nueva antes de renderizar.

## Por qué importa (datos para el anuncio y la presentación)

1. **Un contexto más largo rinde menos, aunque la tarea sea igual.** Chroma midió 18 modelos (entre ellos GPT-4.1, Claude 4 y Gemini 2.5) y encontró que el rendimiento se vuelve menos confiable a medida que crece la entrada, incluso en tareas simples. La información que distrae empeora la caída. ([Chroma, "Context Rot", 2025](https://research.trychroma.com/context-rot))
2. **La atención es un presupuesto.** Anthropic describe el contexto como un recurso finito con rendimientos decrecientes: cada token nuevo consume parte del "presupuesto de atención" del modelo. Recomienda buscar el conjunto más chico de tokens con más señal. ([Anthropic, "Effective context engineering for AI agents"](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))
3. **Las herramientas cargan contexto antes de empezar.** En el ejemplo de Anthropic, 5 servidores MCP con 58 herramientas ocupan unos 55.000 tokens antes de que empiece la conversación. ([Anthropic, "Advanced tool use"](https://www.anthropic.com/engineering/advanced-tool-use))
4. **Lo que queda en el medio se pierde.** Los modelos usan mejor la información del principio y del final del contexto, y rinden peor cuando el dato está en el medio. ([Liu et al., "Lost in the Middle", 2023](https://arxiv.org/abs/2307.03172))

Cómo se conecta con Cognita:

- Muestra cuántos tokens se cargan antes del primer mensaje y cuáles nunca se usan (punto 3).
- `/cognita trim` y `/cognita hold` los sacan, con el comando exacto y cómo deshacerlo (punto 2).
- Pressure estima cuánto se reparte la atención, y los tags marcan lo que tiene que sobrevivir a una compactación (puntos 1 y 4).

Reglas para no exagerar en el anuncio:

- La presión de atención es una **estimación**, no una medición del modelo. En pantalla, "estimado" o nada de porcentajes de atención.
- No decir "tu agente funciona X% mejor": ningún estudio citado mide Cognita.
- Los datos externos van con su fuente en la descripción del video o en la presentación, no como afirmaciones propias.
