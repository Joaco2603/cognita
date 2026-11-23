# Cognita: presentation script (English)

Read it as written. Replace the numbers with the ones from the new recording.

---

Do you use AI agents, and you can't tell why they burn through so much budget, or why their answers get worse the longer you work?

Here is what is happening.

Before you type a single word, your agent has already loaded tools, skills and instructions. In our test session, that was 35,000 tokens. A token is a small piece of text the AI reads, and you pay for every one. About 9,000 of them were never used, not even once.

It gets worse. The more you pile into a conversation, the less attention the model gives to the things that matter. Research shows that long inputs make models less reliable, and that details buried in the middle get lost.

That is why we built Cognita. It is a plugin for Claude Code that lets you see, trim and protect your agent's context.

See. One command opens a panel next to your session. It shows everything your agent loads, and what it never uses.

Trim. Cognita gives you the exact command to remove that waste, and the command to undo it. It can also stop a tool from loading until the moment you need it.

Protect. The Pressure view estimates how much attention each part of your conversation gets. You mark the things that must survive with simple tags, like "important" or "decision". When the conversation is compacted, Cognita checks what was kept, what was rewritten and what was lost.

Cognita also shows what your agent is allowed to do, without running anything. In our demo, it found that reading a secrets file did not ask for permission. We added one rule, checked again, and it was blocked.

And it is built for teams. A shared policy file sets the rules for everyone. A report lists every hook and connected tool, and whether it is pinned to a version. And you see the real cost in dollars.

It works on Windows, macOS and Linux, and it installs with two commands.

Cognita. Know what your agent knows.

---

Sources for the description, not for reading aloud:

- Chroma, "Context Rot", 2025: https://research.trychroma.com/context-rot
- Anthropic, "Effective context engineering for AI agents": https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Liu et al., "Lost in the Middle", 2023: https://arxiv.org/abs/2307.03172

Honesty notes:

- The attention figure in Pressure is an estimate, not a measurement of the model. Say "estimates" and never quote a percentage as fact.
- Do not say Cognita makes an agent work X% better. No study measures that.
