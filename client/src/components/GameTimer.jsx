import { ClockIcon } from '@heroicons/react/24/solid'
import { useState, useEffect } from 'react'

export default function GameTimer({ startTime }) {
    const [elapsed, setElapsed] = useState("00:00");
    const [isOvertime, setIsOvertime] = useState(false);

    useEffect(() => {
        if (!startTime) return;

        const interval = setInterval(() => {
            // 1. Handle Firestore Timestamp vs Standard Date
            const start = startTime.toDate ? startTime.toDate() : new Date(startTime);
            const now = new Date();
            const diffMs = now - start;

            // 2. Calculate Minutes and Seconds
            const totalSeconds = Math.floor(diffMs / 1000);
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;

            // 3. Format with leading zeros (e.g., "05:09")
            const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            setElapsed(formatted);

            // 4. Visual Warning if > 20 mins
            if (mins >= 20) setIsOvertime(true);

        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    return (
        <div className={`font-mono text-xl font-bold flex items-center gap-2 ${isOvertime ? 'text-red-400 animate-pulse' : 'text-emerald-100'}`}>
            <ClockIcon className="w-6 h-6 text-teal-400"/>
            {elapsed}
        </div>
    );
};