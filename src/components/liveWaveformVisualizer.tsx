import React, { useRef, useEffect } from "react";

interface LiveWaveformVisualizerProps {
  waveformHistory: number[];
}

const LiveWaveformVisualizer: React.FC<LiveWaveformVisualizerProps> = ({
  waveformHistory,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const draw = () => {
      const { width, height } = canvas;
      const centerY = height / 2;
      const barWidth = 3;
      const gap = 2;
      const sliceWidth = barWidth + gap;

      context.clearRect(0, 0, width, height);
      context.lineWidth = barWidth;
      context.strokeStyle = "hsl(0, 50%, 60%)"; // --color-danger

      const maxPointsToShow = Math.floor(width / sliceWidth);
      const historyToDraw = waveformHistory.slice(-maxPointsToShow);

      for (let i = 0; i < historyToDraw.length; i++) {
        const amplitude = historyToDraw[i] * (height / 256);
        const lineHeight = Math.max(2, amplitude);
        const x = width - (historyToDraw.length - i) * sliceWidth;
        const y1 = centerY - lineHeight / 2;

        context.beginPath();
        context.moveTo(x, y1);
        context.lineTo(x, y1 + lineHeight);
        context.stroke();
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      canvas.width = width;
      canvas.height = height;
      draw();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    draw();

    return () => {
      resizeObserver.disconnect();
    };
  }, [waveformHistory]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default LiveWaveformVisualizer;
