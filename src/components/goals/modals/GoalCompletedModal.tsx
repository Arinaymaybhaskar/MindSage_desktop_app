import React, { useEffect, useRef } from "react";
import { PartyPopper } from "lucide-react";
import Modal from "../../Modal"; // Using the themed base Modal

interface GoalCompletedModalProps {
  isOpen: boolean;
  onClose: () => void;
  goalTitle: string;
}

const GoalCompletedModal: React.FC<GoalCompletedModalProps> = ({
  isOpen,
  onClose,
  goalTitle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Confetti Animation Logic ---
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrameId: number;
    const confetti: any[] = [];
    const confettiCount = 100;
    // --- CHANGE: Themed colors for confetti ---
    const colors = [
      "hsl(120, 50%, 60%)", // success
      "hsl(238, 52%, 70%)", // info
      "hsl(61, 50%, 60%)", // warning
      "hsl(0, 50%, 60%)", // danger
    ];

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resizeCanvas();

    for (let i = 0; i < confettiCount; i++) {
      confetti.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        radius: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: Math.random() * 10 - 5,
        vy: Math.random() * -15 - 5,
        alpha: 1,
      });
    }

    const animate = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      confetti.forEach((p, i) => {
        p.vy += 0.4;
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.01;

        if (p.alpha > 0) {
          context.globalAlpha = p.alpha;
          context.beginPath();
          context.fillStyle = p.color;
          context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          context.fill();
        } else {
          confetti.splice(i, 1);
        }
      });

      if (confetti.length > 0) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animate();

    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen]);

  return (
    // --- CHANGE: Using the base Modal component ---
    <Modal isOpen={isOpen} onClose={onClose} title="Goal Completed!" size="sm">
      <div className="relative text-center overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        <div className="relative z-10">
          {/* --- CHANGE: Themed icon container --- */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4">
            <PartyPopper className="h-10 w-10 text-success" />
          </div>
          {/* --- CHANGE: Themed text --- */}
          <p className="text-text-light-sub dark:text-text-dark-sub my-4">
            You've successfully completed your goal: <br />
            <strong className="text-text-light dark:text-text-dark">
              "{goalTitle}"
            </strong>
          </p>
          {/* --- CHANGE: Themed button --- */}
          <button
            onClick={onClose}
            className="mt-4 w-full bg-success text-white font-bold py-3 px-4 rounded-lg hover:bg-success/90 transition-all transform hover:scale-105"
          >
            Awesome!
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default GoalCompletedModal;
