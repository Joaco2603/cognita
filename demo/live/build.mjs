// Builds index.html for one language from script.json and the live take.
// Usage: node build.mjs en|es
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lang = process.argv[2] || 'en'
const script = JSON.parse(readFileSync(join(here, 'script.json'), 'utf8'))
const ui = script.ui[lang]
const TOTAL = 81

const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
const esc = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Cuts of the live take: [timeline start, source start, length].
const cuts = [[4, 1.5, 28], [32, 34, 13], [45, 54, 30]]
const videos = cuts.map(([start, from, length], i) => `
        <video id="take-${i}" class="clip take" src="assets/live-take.mp4" muted playsinline
          data-start="${start}" data-duration="${length}" data-media-start="${from}" data-track-index="0"></video>`).join('')

const lines = script.lines.map((line, i) => {
  const file = `assets/vo-${lang}-${i}.mp3`
  const has = existsSync(join(here, file))
  const length = has ? probe(join(here, file)) : line[lang].say.split(' ').length / 2.6
  return { i, at: line.at, file, has, length, cap: line[lang].cap }
})
for (const [k, line] of lines.entries()) {
  const next = lines[k + 1]
  const end = Math.min(TOTAL, line.at + line.length + 0.5, next ? next.at - 0.1 : TOTAL)
  line.capLength = Math.max(1.5, end - line.at)
  if (next && line.at + line.length > next.at - 0.15) console.warn(`line ${k} overruns the next by ${(line.at + line.length - next.at).toFixed(2)}s`)
}
const voice = lines.filter((l) => l.has).map((l) => `
      <audio id="vo-${l.i}" src="${l.file}" data-start="${l.at}" data-duration="${l.length.toFixed(3)}" data-track-index="${3 + (l.i % 2)}" data-volume="1"></audio>`).join('')
const captions = lines.map((l) => `
      <div id="cap-${l.i}" class="clip cap" data-start="${l.at}" data-duration="${l.capLength.toFixed(2)}" data-track-index="5"><span>${esc(l.cap)}</span></div>`).join('')
const music = existsSync(join(here, 'assets/music.mp3')) ? `
      <audio id="music" src="assets/music.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="2" data-volume="0.16"
        data-automation='{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":0},{"t":1.5,"v":1},{"t":${TOTAL - 3},"v":1},{"t":${TOTAL},"v":0}]}]}'></audio>` : ''

const html = `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Cognita live demo (${lang})</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ground: #101117; --panel: #1e1f29; --edge: #2c2e3b; --ink: #f4e9e1; --dim: #9097a6; --accent: #d97757; --live: #e5534b; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--ground); color: var(--ink); font-family: "Segoe UI", sans-serif; }
      .clip { position: absolute; }
      #stage { position: absolute; left: 134px; top: 22px; width: 1652px; height: 929px; border-radius: 14px; overflow: hidden; border: 2px solid var(--edge); background: #0c0c0c; }
      #zoom { position: absolute; inset: 0; transform-origin: 50% 50%; }
      .take { inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #live { position: absolute; right: 22px; bottom: 18px; display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-radius: 10px; background: rgba(16,17,23,0.85); font: 600 24px "Segoe UI", sans-serif; letter-spacing: 0.12em; color: var(--ink); }
      #live i { width: 12px; height: 12px; border-radius: 6px; background: var(--live); }
      .cap { left: 140px; right: 140px; top: 958px; height: 112px; display: flex; align-items: center; justify-content: center; text-align: center; }
      .cap span { font-size: 34px; line-height: 1.3; font-weight: 600; max-width: 1600px; }
      .card { inset: 0; background: var(--ground); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }
      .card img { width: 200px; height: 200px; }
      .card .title { font-size: 128px; font-weight: 800; letter-spacing: -0.04em; }
      .card .sub { font-size: 42px; color: var(--dim); text-align: center; max-width: 1500px; }
      .card .tag { font-size: 26px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
      .card code { font-family: Consolas, monospace; font-size: 32px; padding: 14px 26px; border-radius: 12px; background: var(--panel); border: 2px solid var(--edge); }
      .card code b { color: var(--accent); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
      <div id="stage">
        <div id="zoom">${videos}
        </div>
        <div id="live" data-layout-ignore><i></i>${esc(ui.rec)}</div>
      </div>

      <section id="intro" class="clip card" data-start="0" data-duration="4.4" data-track-index="1">
        <img id="intro-logo" src="assets/icon.png" alt="Cognita" />
        <div id="intro-title" class="title">Cognita</div>
        <div id="intro-tag" class="tag">${esc(ui.tag)}</div>
      </section>

      <section id="outro" class="clip card" data-start="74.6" data-duration="${(TOTAL - 74.6).toFixed(1)}" data-track-index="1">
        <img id="outro-logo" src="assets/icon.png" alt="Cognita" />
        <div id="outro-title" class="title">Cognita</div>
        <div id="outro-sub" class="sub">${esc(ui.sub)}</div>
        <code id="outro-cmd"><b>/plugin</b> marketplace add Joaco2603/cognita</code>
        <code id="outro-cmd2"><b>/plugin</b> install cognita@cognita</code>
      </section>
${captions}
${music}${voice}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const up = (sel, at, d = 0.6) => tl.fromTo(sel, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: d, ease: "power3.out" }, at);
      const zoom = (at, until, scale, origin) => {
        tl.set("#zoom", { transformOrigin: origin }, at);
        tl.to("#zoom", { scale, duration: 0.9, ease: "power2.inOut" }, at);
        tl.to("#zoom", { scale: 1, duration: 0.8, ease: "power2.inOut" }, until);
      };
      tl.set("#zoom", { scale: 1 }, 0);

      // Intro 0-4.4
      tl.fromTo("#intro-logo", { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.8, ease: "back.out(1.6)" }, 0.1);
      up("#intro-title", 0.4); up("#intro-tag", 0.9);
      tl.to("#intro", { opacity: 0, duration: 0.4, ease: "power1.in" }, 4.0);

      // Live take: push in on what the voice is talking about.
      zoom(14.6, 21.4, 1.3, "92% 50%");   // context levers
      zoom(23.6, 31.0, 1.35, "92% 64%");  // access: .env runs without asking
      zoom(52.6, 59.6, 1.4, "92% 62%");   // blocked
      zoom(63.6, 73.6, 1.3, "4% 78%");    // trim plan

      // Captions
      document.querySelectorAll(".cap span").forEach((el) => {
        const at = Number(el.parentElement.dataset.start);
        tl.fromTo(el, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, at);
      });

      // Outro
      tl.fromTo("#outro", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 74.6);
      up("#outro-logo", 74.8); up("#outro-title", 75.1); up("#outro-sub", 75.6); up("#outro-cmd", 76.6); up("#outro-cmd2", 77.0);

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`
writeFileSync(join(here, 'index.html'), html)
console.log(`index.html (${lang}): ${lines.filter((l) => l.has).length}/${lines.length} voice lines, music ${music ? 'on' : 'off'}`)
