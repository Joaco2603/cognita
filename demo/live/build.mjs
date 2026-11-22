// Builds index.html (and a music bed of the right length) for one language
// from script.json, the live take and the voice lines.
// Usage: node build.mjs en|es
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lang = process.argv[2] || 'en'
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'))
const ui = script.ui[lang]
const L = ui.labels

const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r2 = (n) => Math.round(n * 100) / 100

// ---- voice lines --------------------------------------------------------
const lines = script.lines.map((line, i) => {
  const file = `assets/vo-${lang}-${i}.mp3`
  const has = existsSync(join(here, file))
  const length = has ? probe(join(here, file)) : line[lang].say.split(' ').length / 2.6
  return { ...line, i, file, has, length, cap: line[lang].cap, say: line[lang].say }
})
const GAP = 0.3

// Intro card: the two intro lines back to back.
const intro = lines.filter((l) => l.intro !== undefined)
let t = 0.4
for (const l of intro) { l.at = t; t += l.length + GAP }
const INTRO = r2(t + 2.2)

// Cuts of the live take, in source seconds, played back to back after the intro.
const segments = [[1.5, 41.2], [46.6, 51.0], [54.0, 80.6]]
let cursor = INTRO
const cuts = segments.map(([from, to]) => { const c = { from, to, at: cursor }; cursor = r2(cursor + to - from); return c })
const FOOT_END = cursor
const T = (src) => {
  const c = cuts.find((c) => src >= c.from - 0.01 && src <= c.to + 0.01)
  if (!c) throw new Error(`source ${src}s is not in any cut`)
  return r2(c.at + src - c.from)
}

// Footage lines: at their source moment, pushed later if the previous line still talks.
let prevEnd = 0
for (const l of lines) {
  if (l.src !== undefined) {
    const want = T(l.src)
    l.at = r2(Math.max(want, prevEnd + GAP))
    if (l.at - want > 0.05) console.warn(`line ${l.i} slips ${(l.at - want).toFixed(2)}s`)
  }
  if (l.at !== undefined) prevEnd = l.at + l.length
}
const outroLine = lines.find((l) => l.outro !== undefined)
const OUTRO = r2(Math.max(FOOT_END, prevEnd + GAP))
outroLine.at = r2(OUTRO + 0.6)
const TOTAL = r2(outroLine.at + outroLine.length + 2.2)
if (FOOT_END < prevEnd - 0.1) console.warn(`voice runs ${(prevEnd - FOOT_END).toFixed(2)}s past the footage`)

for (const [k, line] of lines.entries()) {
  const next = lines[k + 1]
  const end = Math.min(TOTAL, line.at + line.length + 0.5, next ? next.at - 0.1 : TOTAL)
  line.capLength = Math.max(1.5, end - line.at)
}
// When a word is spoken, estimated from its place in the sentence.
const wordAt = (line, word) => {
  const idx = line.say.toLowerCase().indexOf(word.toLowerCase())
  if (idx < 0) throw new Error(`"${word}" not in line ${line.i}`)
  return r2(line.at + line.length * (idx / line.say.length))
}

// ---- camera and highlight boxes (source pixels of the 1920x1080 take) ------
const W = 1652, H = 929, K = W / 1920
const camera = []
const cam = (src, rect, opts = {}) => {
  let s = 1, x = 0, y = 0
  if (rect) {
    const [rx, ry, rw, rh] = rect.map((v) => v * K)
    s = Math.max(1, Math.min(opts.max || 1.8, (W * 0.88) / rw, (H * 0.82) / rh))
    x = Math.min(0, Math.max(W - s * W, W / 2 - s * (rx + rw / 2)))
    y = Math.min(0, Math.max(H - s * H, H / 2 - s * (ry + rh / 2)))
  }
  camera.push({ at: T(src), x: r2(x), y: r2(y), s: r2(s), d: opts.cut ? 0 : 1.0 })
}
const boxes = []
const box = (id, src, off, rect, ink, label, seed, place = 'above') => {
  const pad = 8
  const [x, y, w, h] = [rect[0] - pad, rect[1] - pad, rect[2] + pad * 2, rect[3] + pad * 2].map((v) => r2(v * K))
  boxes.push({ id: `hb-${id}`, on: T(src), off: T(off), x, y, w, h, ink, label, seed, place })
}
const RED = '#ff5a5f', GREEN = '#3ddc84', CYAN = '#59c8ff'

// The pane opens, overview
cam(1.5, null, { cut: true })
cam(4.2, [1060, 70, 830, 760])
cam(6.0, [1066, 190, 814, 330])
box('ctx', 6.6, 8.9, [1078, 198, 790, 316], CYAN, L.ctx, 2)
cam(8.9, [1066, 568, 814, 245])
box('acc', 9.4, 11.6, [1078, 576, 790, 230], RED, L.acc, 5)
// Context
cam(11.8, [1066, 150, 814, 420])
box('window', 12.6, 14.9, [1084, 196, 640, 58], CYAN, L.window, 3)
cam(14.9, [1066, 560, 814, 220])
box('unused', 15.3, 19.7, [1084, 716, 780, 34], CYAN, L.unused, 7)
box('saving', 17.6, 19.7, [1084, 600, 780, 34], GREEN, L.saving, 4)
// Access
cam(19.9, [1066, 380, 814, 380])
cam(24.6, [1066, 560, 814, 190])
box('env', 25.6, 29.0, [1084, 704, 780, 28], RED, L.env, 6)
// Agents
cam(29.1, [1066, 240, 814, 260])
box('agents', 30.2, 33.6, [1070, 256, 806, 232], CYAN, L.agents, 8)
// Fix it live
cam(33.7, null)
cam(35.0, [0, 880, 1420, 110], { max: 1.4 })
box('rule', 38.2, 41.2, [8, 936, 1404, 30], CYAN, L.rule, 9)
cam(46.6, [0, 300, 1300, 240], { cut: true, max: 1.3 })
box('ok', 47.4, 51.0, [24, 330, 1300, 92], GREEN, L.ok, 10)
// Check again
cam(54.0, null, { cut: true })
cam(58.6, [1066, 560, 814, 260])
box('blocked', 62.6, 69.6, [1084, 646, 780, 30], GREEN, L.blocked, 11)
cam(69.8, null)
cam(72.4, [40, 500, 1300, 300], { max: 1.4 })
box('step', 73.4, 80.6, [76, 652, 1220, 76], GREEN, L.step, 12, 'above-right')
box('total', 76.8, 80.6, [76, 764, 760, 30], CYAN, L.total, 13, 'right')

// Chapter chips
const chapterAt = [[1.5, 'pane'], [11.7, 'loads'], [19.9, 'can'], [29.1, 'doing'], [33.8, 'fix'], [54.0, 'check'], [70.4, 'trim']]
const chapters = chapterAt.map(([src, key], i) => {
  const at = T(src), end = i + 1 < chapterAt.length ? T(chapterAt[i + 1][0]) : FOOT_END
  return { id: `ch-${key}`, at, length: r2(end - at), text: ui.chapters[key] }
})

// ---- hand-drawn box component, inlined from the registry install ----------
const comp = readFileSync(join(here, 'compositions/components/hw-box-label.html'), 'utf8')
const compCss = comp.slice(comp.indexOf('/* ---- hw-box-label'), comp.indexOf('/* self-preview scene */'))
const compJs = comp.slice(comp.indexOf('(function () {'), comp.indexOf('// ---- self-preview ----')) + '})();'

// ---- music bed at the right length ---------------------------------------
const bgm = join(here, 'assets/bgm/track.mp3')
if (existsSync(bgm)) {
  const music = join(here, 'assets/music.mp3')
  if (!existsSync(music) || Math.abs(probe(music) - TOTAL) > 0.2) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-stream_loop', '3', '-i', bgm, '-t', String(TOTAL), '-af', `afade=t=out:st=${TOTAL - 3}:d=3`, '-c:a', 'libmp3lame', '-q:a', '2', music])
  }
}

// ---- markup ------------------------------------------------------------------
const videos = cuts.map((c, i) => `
          <video id="take-${i}" class="clip take" src="assets/live-take.mp4" muted playsinline
            data-start="${c.at}" data-duration="${r2(c.to - c.from)}" data-media-start="${c.from}" data-track-index="0"></video>`).join('')
const boxHtml = boxes.map((b) => `
          <div class="hw-box ${b.place}" id="${b.id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;--hw-box-ink:${b.ink}">
            <div class="hw-bx-deform"><div class="hw-bx-boil"><svg viewBox="0 0 ${b.w} ${b.h}"><path></path></svg><div class="hw-bx-label"></div></div></div>
          </div>`).join('')
const chapterHtml = chapters.map((c) => `
        <div id="${c.id}" class="clip chip" data-start="${c.at}" data-duration="${c.length}" data-track-index="6"><span>${esc(c.text)}</span></div>`).join('')
const voice = lines.filter((l) => l.has).map((l) => `
      <audio id="vo-${l.i}" src="${l.file}" data-start="${l.at}" data-duration="${l.length.toFixed(3)}" data-track-index="${3 + (l.i % 2)}" data-volume="1"></audio>`).join('')
const captions = lines.map((l) => `
      <div id="cap-${l.i}" class="clip cap" data-start="${l.at}" data-duration="${l.capLength.toFixed(2)}" data-track-index="5"><span>${esc(l.cap)}</span></div>`).join('')
const music = existsSync(join(here, 'assets/music.mp3')) ? `
      <audio id="music" src="assets/music.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="2" data-volume="0.16"
        data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":1.5,"v":1},{"t":${r2(TOTAL - 3)},"v":1},{"t":${TOTAL},"v":0}]}]}'></audio>` : ''

const sources = lang === 'es'
  ? [['plugins', 'Plugins'], ['skills', 'Skills'], ['mcp', 'Servidores MCP'], ['reglas', 'Reglas de permisos']]
  : [['plugins', 'Plugins'], ['skills', 'Skills'], ['mcp', 'MCP servers'], ['permission', 'Permission rules']]
const capWords = lang === 'es' ? ['carga', 'puede hacer', 'está haciendo'] : ['loads', 'can do', 'doing']
const srcHtml = sources.map(([, text], i) => `<div id="src-${i}" class="src">${esc(text)}</div>`).join('')
const capHtml = (prefix) => ui.caps.map(([head, body], i) => `
          <div id="${prefix}-${i}" class="cap-row"><b>${i + 1}</b><div><h3>${esc(head)}</h3><p>${esc(body)}</p></div></div>`).join('')
const cmdHtml = ui.cmds.map(([cmd, what], i) => `<div id="cmd-${i}" class="cmd"><code>${esc(cmd)}</code><span>${esc(what)}</span></div>`).join('')

const pops = [
  ...sources.map(([word], i) => [`#src-${i}`, wordAt(intro[0], word)]),
  ...capWords.map((word, i) => [`#icap-${i}`, wordAt(intro[1], word) - 0.15]),
]

const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Cognita live demo (${lang})</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Caveat"; src: url("assets/fonts/Caveat-700-latin.woff2") format("woff2"); font-weight: 700; font-display: block; }
      :root { --ground: #101117; --panel: #1e1f29; --edge: #2c2e3b; --ink: #f4e9e1; --dim: #9097a6; --accent: #d97757; --live: #e5534b; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--ground); color: var(--ink); font-family: "Segoe UI", sans-serif; }
      .clip { position: absolute; }
      #stage { position: absolute; left: 134px; top: 22px; width: 1652px; height: 929px; border-radius: 14px; overflow: hidden; border: 2px solid var(--edge); background: #0c0c0c; }
      #zoom { position: absolute; left: 0; top: 0; width: 1652px; height: 929px; transform-origin: 0 0; }
      .take { inset: 0; width: 100%; height: 100%; object-fit: cover; }
      ${compCss}
      .hw-box .hw-bx-label { width: auto; left: 50%; transform: translateX(-50%); padding: 0 16px; border-radius: 10px; background: rgba(10,10,12,0.85); line-height: 1.15; font-size: 44px; }
      .hw-box.above-right .hw-bx-label { left: auto; right: 0; transform: none; }
      .hw-box.right .hw-bx-label { left: calc(100% + 18px); top: 50% !important; transform: translateY(-50%); }
      .hw-box .hw-bx-label { text-shadow: 0 2px 10px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,0.9); }
      .hw-box path:not([stroke]) { stroke-width: 5; filter: drop-shadow(0 0 6px rgba(0,0,0,0.6)); }
      #live { position: absolute; right: 22px; bottom: 18px; display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 10px; background: rgba(16,17,23,0.85); font: 600 22px "Segoe UI", sans-serif; letter-spacing: 0.12em; color: var(--ink); }
      #live i { width: 12px; height: 12px; border-radius: 6px; background: var(--live); }
      .chip { left: 22px; bottom: 18px; }
      .chip span { display: inline-block; padding: 8px 18px; border-radius: 10px; background: var(--accent); color: #17120f; font: 700 24px "Segoe UI", sans-serif; letter-spacing: 0.04em; }
      .cap { left: 140px; right: 140px; top: 958px; height: 112px; display: flex; align-items: center; justify-content: center; text-align: center; }
      .cap span { font-size: 33px; line-height: 1.3; font-weight: 600; max-width: 1640px; }
      .card { inset: 0; background: var(--ground); display: flex; flex-direction: column; align-items: center; justify-content: center; }
      .brand { display: flex; align-items: center; gap: 28px; }
      .brand img { width: 120px; height: 120px; }
      .brand .title { font-size: 104px; font-weight: 800; letter-spacing: -0.04em; }
      .tag { margin-top: 10px; font-size: 24px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
      .srcs { display: flex; gap: 18px; margin-top: 44px; }
      .src { padding: 12px 26px; border-radius: 40px; border: 2px solid var(--edge); background: var(--panel); font-size: 30px; font-weight: 600; color: var(--dim); }
      .caps { display: flex; gap: 28px; margin-top: 52px; }
      .cap-row { width: 520px; display: flex; gap: 20px; align-items: flex-start; padding: 28px 30px; border-radius: 18px; background: var(--panel); border: 2px solid var(--edge); }
      .cap-row > b { flex: none; width: 52px; height: 52px; border-radius: 26px; background: var(--accent); color: #17120f; font-size: 30px; display: flex; align-items: center; justify-content: center; }
      .cap-row h3 { font-size: 36px; font-weight: 800; margin-bottom: 8px; }
      .cap-row p { font-size: 28px; line-height: 1.35; color: var(--dim); }
      .cmds { display: flex; flex-direction: column; gap: 12px; margin-top: 40px; width: 1100px; }
      .cmd { display: flex; align-items: baseline; gap: 22px; font-size: 30px; color: var(--dim); }
      .cmd code { width: 300px; font-family: Consolas, monospace; font-size: 30px; color: var(--accent); font-weight: 700; }
      .install { display: flex; gap: 20px; margin-top: 40px; }
      .install code { font-family: Consolas, monospace; font-size: 28px; padding: 12px 22px; border-radius: 12px; background: var(--panel); border: 2px solid var(--edge); }
      .install code b { color: var(--accent); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
      <div id="stage">
        <div id="zoom" data-layout-allow-overflow>${videos}${boxHtml}
        </div>
        <div id="live" data-layout-ignore><i></i>${esc(ui.rec)}</div>${chapterHtml}
      </div>

      <section id="intro" class="clip card" data-start="0" data-duration="${INTRO}" data-track-index="1">
        <div id="intro-brand" class="brand"><img src="assets/icon.png" alt="Cognita" /><div class="title">Cognita</div></div>
        <div id="intro-tag" class="tag">${esc(ui.tag)}</div>
        <div class="srcs">${srcHtml}</div>
        <div class="caps">${capHtml('icap')}
        </div>
      </section>

      <section id="outro" class="clip card" data-start="${OUTRO}" data-duration="${r2(TOTAL - OUTRO)}" data-track-index="1">
        <div id="outro-brand" class="brand"><img src="assets/icon.png" alt="Cognita" /><div class="title">Cognita</div></div>
        <div class="caps">${capHtml('ocap')}
        </div>
        <div id="outro-cmds" class="cmds">${cmdHtml}</div>
        <div id="outro-install" class="install"><code><b>/plugin</b> marketplace add Joaco2603/cognita</code><code><b>/plugin</b> install cognita@cognita</code></div>
      </section>
${captions}
${music}${voice}
    </div>
    <script>
      ${compJs}
    </script>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const up = (sel, at, d = 0.5) => tl.fromTo(sel, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, at);
      const pop = (sel, at) => tl.fromTo(sel, { opacity: 0, scale: 0.85, y: 18 }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.8)" }, at);

      // Intro: what Claude Code loads, then the three things Cognita shows.
      up("#intro-brand", 0.1, 0.7); up("#intro-tag", 0.5);
      ${pops.map(([sel, at]) => `pop("${sel}", ${at});`).join(' ')}
      ${sources.map((_, i) => `tl.to("#src-${i}", { color: "#f4e9e1", borderColor: "#d97757", duration: 0.3 }, ${pops[i][1] + 0.2});`).join(' ')}
      tl.to("#intro", { opacity: 0, duration: 0.4, ease: "power1.in" }, ${r2(INTRO - 0.4)});

      // Camera: pan and zoom to what the voice is talking about.
      tl.set("#zoom", { x: 0, y: 0, scale: 1 }, 0);
      ${camera.map((c) => c.d ? `tl.to("#zoom", { x: ${c.x}, y: ${c.y}, scale: ${c.s}, duration: ${c.d}, ease: "power2.inOut" }, ${c.at});` : `tl.set("#zoom", { x: ${c.x}, y: ${c.y}, scale: ${c.s} }, ${c.at});`).join('\n      ')}

      // Hand-drawn boxes on what matters.
      ${boxes.map((b) => `hwBoxBuild("#${b.id}", { seed: ${b.seed}, label: ${JSON.stringify(b.label)} }); hwBoxOn(tl, "#${b.id}", ${b.on}); hwBoxOff(tl, "#${b.id}", ${r2(b.off - 0.35)});`).join('\n      ')}

      // Chapter chips and captions
      document.querySelectorAll(".chip span").forEach((el) => {
        const at = Number(el.parentElement.dataset.start);
        tl.fromTo(el, { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: "power3.out" }, at + 0.1);
      });
      document.querySelectorAll(".cap span").forEach((el) => {
        const at = Number(el.parentElement.dataset.start);
        tl.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, at);
      });

      // Outro: the recap and how to install.
      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${OUTRO});
      up("#outro-brand", ${r2(OUTRO + 0.2)}); ${[0, 1, 2].map((i) => `pop("#ocap-${i}", ${r2(OUTRO + 0.6 + i * 0.35)});`).join(' ')}
      up("#outro-cmds", ${r2(OUTRO + 1.8)}); up("#outro-install", ${r2(OUTRO + 2.4)});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
writeFileSync(join(here, 'index.html'), html)
console.log(`index.html (${lang}): ${TOTAL}s, intro ${INTRO}s, outro at ${OUTRO}s, ${lines.filter((l) => l.has).length}/${lines.length} voice lines, ${boxes.length} boxes, ${camera.length} camera moves`)
console.log(lines.map((l) => `  ${l.i}@${l.at} (${l.length.toFixed(1)}s)`).join('\n'))
