import React, { useRef, useEffect } from 'react';

interface LiveWaveformVisualizerProps {
    waveformHistory: number[];
}

// --- Component: LiveWaveformVisualizer ---
// This component renders the audio waveform as it's being recorded.
const LiveWaveformVisualizer: React.FC<LiveWaveformVisualizerProps> = ({ waveformHistory }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;
        
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        const sliceWidth = 3;

        context.clearRect(0, 0, width, height);
        
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = '#ef4444';

        const maxPointsToShow = Math.floor((width / 2) / sliceWidth);
        const historyToDraw = waveformHistory.slice(-maxPointsToShow);

        for (let i = 0; i < historyToDraw.length; i++) {
            const amplitude = historyToDraw[i];
            const lineHeight = Math.min(amplitude, height);
            const x = (width / 2) - (historyToDraw.length - i) * sliceWidth;
            const y1 = centerY - lineHeight / 2;
            const y2 = centerY + lineHeight / 2;
            context.moveTo(x, y1);
            context.lineTo(x, y2);
        }
        context.stroke();

        context.beginPath();
        context.moveTo(width / 2, 0);
        context.lineTo(width / 2, height);
        context.strokeStyle = '#dc2626';
        context.lineWidth = 1;
        context.stroke();

    }, [waveformHistory]);

    return <canvas ref={canvasRef} width="600" height="150" className="w-full h-36 rounded-lg bg-gray-800" />;
};

export default LiveWaveformVisualizer;
