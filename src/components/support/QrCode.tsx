import { useMemo } from "react";
import qrcode from "qrcode-generator";

interface QrCodeProps {
  /** What the code holds, e.g. "tel:988". */
  value: string;
  /** What a screen reader says: the number, not "QR image". */
  label: string;
  size?: number;
}

/**
 * A QR code drawn locally as SVG. It always sits on a white square with a
 * four-module quiet zone, so it scans in dark mode too.
 */
export default function QrCode({ value, label, size = 176 }: QrCodeProps) {
  const { count, cells } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const dark: string[] = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) dark.push(`M${c} ${r}h1v1h-1z`);
    return { count: n, cells: dark.join("") };
  }, [value]);
  const quiet = 4;
  const box = count + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`${-quiet} ${-quiet} ${box} ${box}`}
      shapeRendering="crispEdges"
      className="rounded-lg"
      style={{ background: "#ffffff" }}
    >
      <rect x={-quiet} y={-quiet} width={box} height={box} fill="#ffffff" />
      <path d={cells} fill="#000000" />
    </svg>
  );
}
