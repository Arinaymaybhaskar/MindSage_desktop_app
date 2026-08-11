import { MOODS } from "../../utils/moods";

export interface MoodOrbProps {
  level: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES = {
  sm: "size-28",
  md: "size-44",
  lg: "size-56",
};

const TEXT_SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

const LABEL_SIZES = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm",
};

export default function MoodOrb({ level, size = "md", className = "" }: MoodOrbProps) {
  const mood = MOODS[level - 1];

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="img" aria-label={`Overall mood: ${mood.label}`}>
      <div
        className={`relative overflow-hidden rounded-full ${SIZE_CLASSES[size]}`}
        style={{
          background: `linear-gradient(to bottom, ${mood.top} 0%, color-mix(in oklch, ${mood.top}, ${mood.bottom} 55%) 45%, ${mood.bottom} 100%)`,
          boxShadow: `0 20px 60px -15px ${mood.top}, inset 0 2px 10px rgba(255,255,255,0.35), inset 0 -18px 40px -20px rgba(0,0,0,0.25)`,
        }}
      >
        <svg className="animate-orb-drift-a absolute -inset-1/4 h-[150%] w-[150%]" aria-hidden="true">
          <defs>
            <filter id="mood-clouds-1" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.008 0.012"
                numOctaves="5"
                seed="7"
                stitchTiles="stitch"
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="60s"
                  values="0.008 0.012;0.009 0.011;0.01 0.01;0.0095 0.0105;0.009 0.011;0.0085 0.0115;0.008 0.012"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1"
                />
              </feTurbulence>
              <feColorMatrix
                in="noise"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.7 0.7 0.7 0 -0.5"
              />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter="url(#mood-clouds-1)" opacity="0.6" />
        </svg>
        <svg className="animate-orb-drift-b absolute -inset-1/4 h-[150%] w-[150%]" aria-hidden="true">
          <defs>
            <filter id="mood-clouds-2" x="-20%" y="-20%" width="140%" height="140%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.02 0.025"
                numOctaves="4"
                seed="19"
                stitchTiles="stitch"
                result="noise2"
              >
                <animate
                  attributeName="baseFrequency"
                  dur="48s"
                  values="0.02 0.025;0.022 0.023;0.024 0.021;0.023 0.022;0.021 0.024;0.02 0.025"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keySplines="0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1;0.3 0 0.7 1"
                />
              </feTurbulence>
              <feColorMatrix
                in="noise2"
                type="matrix"
                values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.6 0.6 0.6 0 -0.4"
              />
            </filter>
          </defs>
          <rect width="100%" height="100%" filter="url(#mood-clouds-2)" opacity="0.35" />
        </svg>
        <span
          className="animate-orb-drift-c absolute -left-1/4 top-[42%] h-1/3 w-[150%] rounded-full"
          style={{
            background: "radial-gradient(ellipse 48% 42% at 50% 50%, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 62%)",
            filter: "blur(12px)",
          }}
        />
        <span className="absolute left-1/4 top-[12%] size-10 rounded-full bg-white/30 blur-2xl" />
        <span
          className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/15 animate-orb-glow"
          style={{ color: mood.top }}
        />
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className={`font-semibold tracking-tight ${TEXT_SIZES[size]} text-text-light dark:text-text-dark`}>{mood.label}</span>
        <span className={`font-medium uppercase tracking-widest ${LABEL_SIZES[size]} text-text-light-sub dark:text-text-dark-sub`}>Overall mood</span>
      </div>
    </div>
  );
}