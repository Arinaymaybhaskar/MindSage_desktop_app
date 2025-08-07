import React, { useRef, useEffect } from 'react';

interface PlaybackWaveformVisualizerProps {
    waveformHistory: number[];
    audioRef: React.RefObject<HTMLAudioElement>;
}

// --- Component: PlaybackWaveformVisualizer ---
// This component renders the full recorded waveform and a playhead for playback.
// It now includes scrubbing functionality.
const PlaybackWaveformVisualizer: React.FC<PlaybackWaveformVisualizerProps> = ({ waveformHistory, audioRef }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>();
    const isScrubbingRef = useRef(false);

    // This function calculates the new time based on the click/drag position and updates the audio element.
    const handleSeek = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!audioRef.current || !canvasRef.current || !isFinite(audioRef.current.duration)) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const progress = Math.max(0, Math.min(1, x / rect.width)); // Ensure progress is between 0 and 1
        
        audioRef.current.currentTime = progress * audioRef.current.duration;
    };

    const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
        isScrubbingRef.current = true;
        handleSeek(event);
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (isScrubbingRef.current) {
            handleSeek(event);
        }
    };

    const handleMouseUpOrLeave = () => {
        isScrubbingRef.current = false;
    };

    // This function draws the static waveform and the moving playhead.
    const drawWaveform = (playheadPosition = 0) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;
        
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        context.clearRect(0, 0, width, height);
        
        // Draw the static waveform background
        context.beginPath();
        context.lineWidth = 2;
        context.strokeStyle = '#ef4444'; // Red color for the waveform
        
        const sliceWidth = width / waveformHistory.length;
        for (let i = 0; i < waveformHistory.length; i++) {
            const amplitude = waveformHistory[i];
            const lineHeight = Math.min(amplitude, height);
            const x = i * sliceWidth;
            const y1 = centerY - lineHeight / 2;
            const y2 = centerY + lineHeight / 2;
            context.moveTo(x, y1);
            context.lineTo(x, y2);
        }
        context.stroke();

        // Draw the playhead
        if (playheadPosition > 0) {
            context.beginPath();
            context.moveTo(playheadPosition, 0);
            context.lineTo(playheadPosition, height);
            context.strokeStyle = '#facc15'; // Yellow for playhead
            context.lineWidth = 1;
            context.stroke();
        }
    };

    // This effect handles the animation of the playhead.
    useEffect(() => {
        drawWaveform(); // Initial draw

        const audioEl = audioRef.current;
        if (!audioEl) return;

        const animatePlayhead = () => {
            if (audioEl.paused && !isScrubbingRef.current) {
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                return;
            }
            const progress = audioEl.currentTime / audioEl.duration;
            const playheadPosition = canvasRef.current && isFinite(progress) ? canvasRef.current.width * progress : 0;
            drawWaveform(playheadPosition);
            animationFrameRef.current = requestAnimationFrame(animatePlayhead);
        };

        const handlePlay = () => {
            animationFrameRef.current = requestAnimationFrame(animatePlayhead);
        };
        const handlePause = () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };

        audioEl.addEventListener('play', handlePlay);
        audioEl.addEventListener('pause', handlePause);
        audioEl.addEventListener('seeked', animatePlayhead);
        audioEl.addEventListener('timeupdate', animatePlayhead); // For smooth animation

        return () => {
            audioEl.removeEventListener('play', handlePlay);
            audioEl.removeEventListener('pause', handlePause);
            audioEl.removeEventListener('seeked', animatePlayhead);
            audioEl.removeEventListener('timeupdate', animatePlayhead);
            if(animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };

    }, [waveformHistory, audioRef]);

    return (
        <canvas 
            ref={canvasRef} 
            width="600" 
            height="150" 
            className="w-full h-36 rounded-lg bg-gray-800 cursor-pointer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
        />
    );
};

export default PlaybackWaveformVisualizer;
