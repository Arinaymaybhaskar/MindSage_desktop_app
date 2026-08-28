import Lottie from "lottie-react";

interface BackgroundProps {
  /** Parsed Lottie animation JSON, supplied by the caller. */
  animationData: unknown;
}

export default function Background({ animationData }: BackgroundProps) {
  return (
    <div className="absolute inset-0 w-full h-full ">
      <Lottie
        animationData={animationData}
        loop
        autoplay
        className="w-full h-full object-cover"
      />
      {/* Optional dark overlay for readability */}
      <div className="absolute inset-0 bg-black/20"></div>
    </div>
  );
}
