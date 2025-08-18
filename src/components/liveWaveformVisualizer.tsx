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

    // --- Drawing logic, now fully dynamic ---
    const draw = () => {
      const { width, height } = canvas;
      const centerY = height / 2;
      const barWidth = 3; // Width of each waveform bar
      const gap = 2; // Gap between bars
      const sliceWidth = barWidth + gap;

      context.clearRect(0, 0, width, height);
      context.lineWidth = barWidth;
      context.strokeStyle = "#f87171"; // A slightly softer red for the waveform

      // Determine how many bars can fit on the canvas
      const maxPointsToShow = Math.floor(width / sliceWidth);
      const historyToDraw = waveformHistory.slice(-maxPointsToShow);

      // Draw each bar of the waveform
      for (let i = 0; i < historyToDraw.length; i++) {
        const amplitude = historyToDraw[i] * (height / 256); // Scale amplitude to canvas height
        const lineHeight = Math.max(2, amplitude); // Ensure a minimum line height

        const x = width - (historyToDraw.length - i) * sliceWidth;
        const y1 = centerY - lineHeight / 2;

        context.beginPath();
        context.moveTo(x, y1);
        context.lineTo(x, y1 + lineHeight);
        context.stroke();
      }
    };

    // --- Resize observer to make canvas responsive ---
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      const { width, height } = entry.contentRect;
      canvas.width = width;
      canvas.height = height;
      draw(); // Redraw on resize
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    draw(); // Initial draw

    // Cleanup observer on component unmount
    return () => {
      resizeObserver.disconnect();
    };
  }, [waveformHistory]); // Rerun effect when waveform data changes

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default LiveWaveformVisualizer;
