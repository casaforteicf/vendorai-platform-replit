import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={i++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function renderMarkdown(body: string): React.ReactNode[] {
  const blocks = body.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length) {
      nodes.push(
        <ol key={key++} className="list-decimal list-outside ml-6 space-y-2 text-slate-700 leading-relaxed">
          {listItems.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      listItems = [];
    }
  }

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={key++} className="text-2xl font-bold text-slate-900 mt-10 mb-4">
          {trimmed.slice(3)}
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3 key={key++} className="text-xl font-semibold text-slate-800 mt-8 mb-3">
          {trimmed.slice(4)}
        </h3>
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      const itemLines = trimmed.split(/\n(?=\d+\.\s)/);
      for (const line of itemLines) {
        const text = line.replace(/^\d+\.\s/, "");
        listItems.push(text);
      }
    } else {
      flushList();
      const lines = trimmed.split("\n");
      nodes.push(
        <p key={key++} className="text-slate-700 leading-relaxed text-[1.05rem]">
          {lines.map((line, li) => (
            <React.Fragment key={li}>
              {li > 0 && <br />}
              {renderInline(line)}
            </React.Fragment>
          ))}
        </p>
      );
    }
  }

  flushList();
  return nodes;
}
