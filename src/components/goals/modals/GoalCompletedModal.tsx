import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PartyPopper } from "lucide-react";

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
    const colors = ["#EF4444", "#F97316", "#84CC16", "#3B82F6", "#A855F7"];

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
        p.vy += 0.4; // Gravity
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
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700 text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            <div className="relative z-10">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10 mb-4">
                <PartyPopper className="h-10 w-10 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                Goal Completed!
              </h3>
              <p className="text-gray-600 dark:text-gray-400 my-4">
                You've successfully completed your goal: <br />
                <strong className="text-gray-800 dark:text-gray-200">
                  "{goalTitle}"
                </strong>
              </p>
              <button
                onClick={onClose}
                className="mt-4 w-full bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 transition-all transform hover:scale-105"
              >
                Awesome!
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GoalCompletedModal;
