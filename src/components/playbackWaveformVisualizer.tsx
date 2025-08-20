import React, { useRef, useEffect, useState } from "react";

interface PlaybackWaveformVisualizerProps {
  audioBlob: Blob;
}

const PlaybackWaveformVisualizer: React.FC<PlaybackWaveformVisualizerProps> = ({
  audioBlob,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);

  useEffect(() => {
    const processAudio = async () => {
      const audioContext = new AudioContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setWaveform(audioBuffer.getChannelData(0));
    };
    processAudio();
  }, [audioBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !waveform) return;

    const draw = () => {
      if (containerRef.current) {
        canvas.width = containerRef.current.offsetWidth;
        canvas.height = containerRef.current.offsetHeight;
      }

      const { width, height } = canvas;
      const centerY = height / 2;
      const barWidth = 2;
      const gap = 1;
      const sliceWidth = barWidth + gap;

      context.clearRect(0, 0, width, height);
      context.lineWidth = barWidth;
      context.strokeStyle = "hsl(238, 52%, 70%)"; // --color-info

      const samples = Math.floor(width / sliceWidth);
      const step = Math.floor(waveform.length / samples);

      for (let i = 0; i < samples; i++) {
        let min = 1.0;
        let max = -1.0;

        for (let j = 0; j < step; j++) {
          const datum = waveform[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }

        const x = i * sliceWidth;
        const y = (1 + min) * centerY;
        const lineHeight = Math.max(1, (max - min) * centerY);

        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + lineHeight);
        context.stroke();
      }
    };

    const resizeObserver = new ResizeObserver(() => draw());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    draw();

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, [waveform]);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} />
    </div>
  );
};

export default PlaybackWaveformVisualizer;
