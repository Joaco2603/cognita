import Terminal from "@/components/Terminal";
import VideoShowcase from "@/components/VideoShowcase";
import CopyBlock from "@/components/CopyBlock";

const REPO = "https://github.com/Joaco2603/cognita";

const FEATURES = [
  {
    k: "01",
    title: "What it has loaded",
    body: "What fills the context window before you type, what it never uses, and the exact commands to trim it.",
    cmd: "/cognita context",
  },
  {
    k: "02",
    title: "What it can do",
    body: "Which risky actions run without asking: git push, rm -rf, reading .env or SSH keys. Plus the rule, hook or plugin behind each verdict.",
    cmd: "/cognita access",
  },
  {
    k: "03",
    title: "What it is doing",
    body: "The subagents running in the session and the tokens each one spends.",
    cmd: "/cognita agents",
  },
  {
    k: "04",
    title: "How hard context works",
    body: "One pressure number and the one step that relieves it. Preview a compaction, then see which tagged items were kept, rewritten or lost.",
    cmd: "/cognita pressure",
  },
];

const FINDINGS = [
  { n: ".env", text: "Reading .env ran without asking until one deny rule blocked it." },
  { n: "~1,080", text: "tokens every session from a plugin with 16 skills that was never used." },
  { n: "−2,644", text: "tokens before the first message by holding unused MCP servers." },
];

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <a href="#" className="brand">
          <img src="/icon.png" alt="" width={26} height={26} /> Cognita
        </a>
        <div className="nav-links">
          <a href="#try">Try it</a>
          <a href="#demo">Demo</a>
          <a href="#install">Install</a>
          <a href={REPO} target="_blank" rel="noreferrer" className="nav-cta">
            GitHub ↗
          </a>
        </div>
      </nav>

      <section className="hero">
        <p className="eyebrow">A Claude Code plugin · Dojo AI Hackathon · Build for Builders</p>
        <h1>
          See everything your <span className="grad">Claude Code agent</span> has access to.
        </h1>
        <p className="lede">
          CLAUDE.md files, MCP servers with hundreds of tools, plugin skills, hooks and months of permission rules.
          Cognita shows all of it in one pane, inside the session you are already in.
        </p>
        <div className="hero-ctas">
          <a href="#install" className="btn primary">
            Install in 2 commands
          </a>
          <a href="#demo" className="btn">
            ▶ Watch the 96 s demo
          </a>
        </div>
      </section>

      <section id="try" className="section try">
        <div className="section-head">
          <h2>Run it right here</h2>
          <p>
            The tour types the commands for you. Click any command, a view in the sidebar, or focus the prompt and type
            your own.
          </p>
        </div>
        <Terminal />
      </section>

      <section className="section findings">
        {FINDINGS.map((f) => (
          <div key={f.n} className="finding">
            <div className="finding-n">{f.n}</div>
            <p>{f.text}</p>
          </div>
        ))}
        <p className="findings-note">Found in real Claude Code sessions.</p>
      </section>

      <section id="demo" className="section">
        <div className="section-head">
          <h2>Watch it in a real session</h2>
          <p>A screen recording of Claude Code with zooms on each finding. Jump to a chapter.</p>
        </div>
        <VideoShowcase />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Four questions, one pane</h2>
        </div>
        <div className="features">
          {FEATURES.map((f) => (
            <article key={f.k} className="feature">
              <span className="feature-k">{f.k}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <code>{f.cmd}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="section audience">
        <div>
          <h3>Developers</h3>
          <p>Know why a session starts at 35k tokens and which plugin or MCP server to turn off.</p>
        </div>
        <div>
          <h3>Teams and leads</h3>
          <p>
            A <code>.cognita.json</code> sets the token budget and the minimum verdict per action. Access flags every
            violation, and <code>/cognita report json</code> fits into CI.
          </p>
        </div>
        <div>
          <h3>Plugin and MCP authors</h3>
          <p>See what your plugin costs in context and which sections it injects into the system prompt.</p>
        </div>
      </section>

      <section id="install" className="section install">
        <div className="section-head">
          <h2>Install</h2>
          <p>
            Then run <code>/cognita</code> in a new session.
          </p>
        </div>
        <CopyBlock lines={["claude plugin marketplace add Joaco2603/cognita", "claude plugin install cognita@cognita"]} />
      </section>

      <footer className="footer">
        <span>Cognita · MIT</span>
        <a href={REPO} target="_blank" rel="noreferrer">
          github.com/Joaco2603/cognita
        </a>
      </footer>
    </main>
  );
}
