import {
  siEvernote,
  siGooglesheets,
  siJoplin,
  siLibreoffice,
  siLogseq,
  siMarkdown,
  siNotesnook,
  siNotion,
  siObsidian,
} from "simple-icons";
import { MindSageMark } from "../ui/MindSageMark";

/**
 * Logos for the apps the import and export screens name.
 *
 * Marks come from Simple Icons (CC0 icon files; each mark remains its owner's
 * trademark and is shown only to say which apps a format works with). Apps
 * Simple Icons does not carry get a lettered tile in the same style rather
 * than a logo lifted from their site, which we have no licence to reuse.
 */

type SimpleIcon = { title: string; hex: string; path: string };

interface LogoSpec {
  name: string;
  icon?: SimpleIcon;
  letters?: string;
  mindsage?: boolean;
}

export const APPS = {
  obsidian: { name: "Obsidian", icon: siObsidian },
  logseq: { name: "Logseq", icon: siLogseq },
  joplin: { name: "Joplin", icon: siJoplin },
  notion: { name: "Notion", icon: siNotion },
  evernote: { name: "Evernote", icon: siEvernote },
  notesnook: { name: "Notesnook", icon: siNotesnook },
  sheets: { name: "Google Sheets", icon: siGooglesheets },
  libreoffice: { name: "LibreOffice", icon: siLibreoffice },
  markdown: { name: "Markdown", icon: siMarkdown },
  dayone: { name: "Day One", letters: "D1" },
  journey: { name: "Journey", letters: "J" },
  daylio: { name: "Daylio", letters: "D" },
  bear: { name: "Bear", letters: "B" },
  excel: { name: "Excel", letters: "X" },
  text: { name: "Any text editor", letters: "Aa" },
  mindsage: { name: "MindSage", mindsage: true },
} satisfies Record<string, LogoSpec>;

export type AppId = keyof typeof APPS;

/** Black marks would vanish on the dark theme; they take the text colour. */
const isDark = (hex: string) => {
  const n = parseInt(hex, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b < 60;
};

export function AppLogo({ id, size = 28 }: { id: AppId; size?: number }) {
  const app: LogoSpec = APPS[id];
  const inner = Math.round(size * 0.6);
  return (
    <span
      title={app.name}
      aria-label={app.name}
      role="img"
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-surface-light dark:bg-tertiary-dark ring-1 ring-border-light dark:ring-border-dark text-text-light dark:text-text-dark"
      style={{ width: size, height: size }}
    >
      {app.icon ? (
        <svg
          viewBox="0 0 24 24"
          width={inner}
          height={inner}
          fill={isDark(app.icon.hex) ? "currentColor" : `#${app.icon.hex}`}
          aria-hidden="true"
        >
          <path d={app.icon.path} />
        </svg>
      ) : app.mindsage ? (
        <MindSageMark size={inner} />
      ) : (
        <span
          className="font-display font-semibold leading-none"
          style={{ fontSize: size * (app.letters!.length > 1 ? 0.34 : 0.44) }}
          aria-hidden="true"
        >
          {app.letters}
        </span>
      )}
    </span>
  );
}

/** A row of logos, with the names readable on hover and to screen readers. */
export function AppLogoRow({
  ids,
  size = 22,
}: {
  ids: AppId[];
  size?: number;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {ids.map((id) => (
        <AppLogo key={id} id={id} size={size} />
      ))}
    </span>
  );
}
