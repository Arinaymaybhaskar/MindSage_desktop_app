import React from "react";
import { revealWords } from "../ui/RevealText";

/**
 * Minimal markdown renderer for chat messages.
 *
 * Local models emit markdown by default - bold, numbered lists, fenced code -
 * and the chat previously rendered `message.text` straight into a <p>, so every
 * answer arrived full of literal asterisks with its paragraph breaks collapsed.
 *
 * This covers the subset models actually produce rather than the full spec, and
 * builds React elements instead of setting innerHTML, so nothing a model emits
 * can inject markup. It is deliberately dependency-free: adding one would fire
 * this project's `postinstall` -> `electron-rebuild` of the better-sqlite3
 * native addon, which is a heavy price for text formatting.
 */

type InlineKey = { key: string };

/**
 * Splits inline text into bold / italic / code / link spans.
 *
 * When `reveal` is set, every word is additionally wrapped so it fades in as
 * it arrives - used while a reply is still streaming.
 */
function renderInline(
  text: string,
  keyPrefix: string,
  reveal = false,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  /** Plain text is either revealed word by word or emitted as-is. */
  const pushText = (value: string, at: number) => {
    if (value === "") return;
    if (reveal) nodes.push(...revealWords(value, `${keyPrefix}-t${at}`));
    else nodes.push(value);
  };
  // Order matters: code first, so ** inside a code span stays literal.
  const pattern =
    /(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

  let rest = text;
  let index = 0;

  while (rest.length > 0) {
    const match = pattern.exec(rest);
    if (!match || match.index === undefined) {
      pushText(rest, index);
      break;
    }

    if (match.index > 0) pushText(rest.slice(0, match.index), index);

    const token = match[0];
    const key: InlineKey = { key: `${keyPrefix}-i${index++}` };

    if (token.startsWith("`")) {
      nodes.push(
        <code
          {...key}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-tertiary-light dark:bg-tertiary-dark font-mono text-[0.85em] text-dark1 dark:text-light1"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
      nodes.push(
        <a
          {...key}
          href={linkMatch?.[2] ?? "#"}
          target="_blank"
          rel="noreferrer noopener"
          className="text-dark1 dark:text-light1 underline underline-offset-2 hover:opacity-80"
        >
          {linkMatch?.[1] ?? token}
        </a>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong {...key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <em {...key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }

    rest = rest.slice(match.index + token.length);
  }

  return nodes;
}

/** Blinking block that marks where a streamed reply is still being written. */
const Caret: React.FC = () => (
  <span
    aria-hidden
    className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[0.18em] rounded-sm bg-text-light dark:bg-text-dark animate-pulse"
  />
);

interface MarkdownProps {
  content: string;
  /** Muted variant for the user's own bubble, which sits on an accent fill. */
  tone?: "default" | "inverted";
  /**
   * Draws a caret at the very end of the text. Rendering it as a sibling of
   * this component instead puts it on its own line, because the last block a
   * markdown document produces is a block-level element.
   */
  caret?: boolean;
  /**
   * Fades each word in as it appears. Only enabled while a reply is streaming:
   * on stored messages every word would animate again each time the list
   * re-renders, and a long conversation would carry hundreds of idle
   * animated nodes for no benefit.
   */
  reveal?: boolean;
}

const Markdown: React.FC<MarkdownProps> = ({
  content,
  tone = "default",
  caret = false,
  reveal = false,
}) => {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;

  const muted =
    tone === "inverted"
      ? "text-white/70"
      : "text-text-light-sub dark:text-text-dark-sub";

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const language = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <div key={`b${key++}`} className="my-2 w-full">
          {language && (
            <div
              className={`px-3 pt-2 pb-1 text-[11px] font-mono uppercase tracking-wide ${muted}`}
            >
              {language}
            </div>
          )}
          <pre className="overflow-x-auto rounded-xl bg-tertiary-light dark:bg-base-dark border border-border-light dark:border-border-dark p-3">
            <code className="font-mono text-[13px] leading-relaxed whitespace-pre">
              {body.join("\n")}
            </code>
          </pre>
        </div>,
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(
        <hr
          key={`b${key++}`}
          className="my-3 border-border-light dark:border-border-dark"
        />,
      );
      i++;
      continue;
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const sizes = [
        "text-lg font-bold",
        "text-base font-bold",
        "text-[15px] font-semibold",
        "text-sm font-semibold",
        "text-sm font-semibold",
        "text-sm font-semibold",
      ];
      blocks.push(
        <p key={`b${key++}`} className={`${sizes[level - 1]} mt-3 first:mt-0`}>
          {renderInline(heading[2], `h${key}`, reveal)}
        </p>,
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className={`my-2 border-l-2 border-light1 dark:border-dark3 pl-3 ${muted}`}
        >
          {renderInline(body.join(" "), `q${key}`, reveal)}
        </blockquote>,
      );
      continue;
    }

    // Lists - ordered and unordered are handled together so a run of mixed
    // markers still produces one list rather than several one-item lists.
    const isBullet = (value: string) => /^\s*[-*+]\s+/.test(value);
    const isNumbered = (value: string) => /^\s*\d+[.)]\s+/.test(value);

    if (isBullet(line) || isNumbered(line)) {
      const ordered = isNumbered(line);
      const items: string[] = [];
      while (i < lines.length && (isBullet(lines[i]) || isNumbered(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ""));
        i++;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={`b${key++}`}
          className={`my-2 space-y-1 pl-5 ${
            ordered ? "list-decimal" : "list-disc"
          } marker:text-text-light-sub dark:marker:text-text-dark-sub`}
        >
          {items.map((item, idx) => (
            <li key={idx} className="pl-1">
              {renderInline(item, `l${key}-${idx}`, reveal)}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph: gather until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trimStart().startsWith("```") &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !isBullet(lines[i]) &&
      !isNumbered(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={`b${key++}`} className="my-2 first:mt-0 last:mb-0">
        {renderInline(paragraph.join(" "), `p${key}`, reveal)}
      </p>,
    );
  }

  if (caret) {
    // Tuck the caret inside the closing paragraph so it sits after the last
    // word rather than dropping to a line of its own. Anything else - a list,
    // a code block, a rule - gets it as a following element, which is the
    // right place for those.
    const last = blocks[blocks.length - 1];
    if (React.isValidElement(last) && last.type === "p") {
      const element = last as React.ReactElement<{
        children?: React.ReactNode;
      }>;
      blocks[blocks.length - 1] = React.cloneElement(
        element,
        undefined,
        <>
          {element.props.children}
          <Caret />
        </>,
      );
    } else {
      blocks.push(<Caret key={`b${key++}`} />);
    }
  }

  return <>{blocks}</>;
};

export default Markdown;
