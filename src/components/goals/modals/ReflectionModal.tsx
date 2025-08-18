import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto'; // Make sure you have 'chart.js' installed
import Modal from '../../Modal';
import type { Goal, ProgressLog } from '../../../types/Goals';

interface ReflectionGoal extends Goal {
  progressLogs: ProgressLog[];
}

const ReflectionModal: React.FC<{ isOpen: boolean; onClose: () => void; goal: ReflectionGoal }> = ({ isOpen, onClose, goal }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (isOpen && chartRef.current && goal.progressLogs) {
            // Destroy previous chart instance if it exists
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (!ctx) return;
            
            const startDate = new Date(goal.created_at);
            const chartData = {
                labels: [startDate.toLocaleDateString(), ...goal.progressLogs.map(log => new Date(log.logged_at).toLocaleDateString())],
                datasets: [{
                    label: `Progress (${goal.unit})`,
                    data: [0, ...goal.progressLogs.map(log => log.value)],
                    borderColor: '#4f46e5',
                    backgroundColor: 'rgba(79, 70, 229, 0.1)',
                    tension: 0.2,
                    fill: true,
                }]
            };

            chartInstance.current = new Chart(ctx, {
                type: 'line',
                data: chartData,
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true } }
                }
            });
        }

        // Cleanup function to destroy chart on component unmount or close
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
                chartInstance.current = null;
            }
        };
    }, [isOpen, goal]);

    const startDate = new Date(goal.created_at);
    const endDate = goal.completed_date ? new Date(goal.completed_date) : new Date();
    const duration = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Reflection: ${goal.title}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center mb-8">
                <div>
                    <p className="text-sm text-gray-500">Started On</p>
                    <p className="font-bold text-lg">{startDate.toLocaleDateString()}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">Completed On</p>
                    <p className="font-bold text-lg">{goal.completed_date ? endDate.toLocaleDateString() : 'In Progress'}</p>
                </div>
                <div>
                    <p className="text-sm text-gray-500">Duration</p>
                    <p className="font-bold text-lg">{`${duration} days`}</p>
                </div>
            </div>
            <div>
                <canvas ref={chartRef}></canvas>
            </div>
        </Modal>
    );
};

export default ReflectionModal;