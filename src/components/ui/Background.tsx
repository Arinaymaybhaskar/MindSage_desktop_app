import Lottie from "lottie-react";
import animationData from "../../../public/Big-waves-[remix].json"; // your Lottie JSON file

export default function Background() {
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
