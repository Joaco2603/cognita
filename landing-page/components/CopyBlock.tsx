"use client";

import { useState } from "react";

export default function CopyBlock({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="copy-block">
      <pre>
        {lines.map((l) => (
          <div key={l}>
            <span className="t-dim">$ </span>
            {l}
          </div>
        ))}
      </pre>
      <button onClick={copy} aria-label="Copy install commands">
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}
