const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000/api";

export const getEstimatedWaitTime = async (branchId, userId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/predict-wait`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ branchId: branchId, userId: userId }),
        });

        if (!response.ok) throw new Error("AI Service Failed");

        const data = await response.json();
        return data; // Returns { estimated_minutes, method, ... }
    } catch (error) {
        console.error("AI Error:", error);
        return {
            estimated_minutes: 12.5, 
            method: "offline_fallback_mode", // This will show in your badge tooltip
            active_machines: 1,
            queue_length: 3
        };
    }
};

export const findPartner = async (userId, branchId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/find-partner`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, branchId }),
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Failed to find partners");
        }
        
        const data = await response.json();
        return data; 
    } catch (error) {
        console.error("AI Partner Error:", error);
        await new Promise(r => setTimeout(r, 1000));
        return {
            requester: "You",
            method: "offline_mock_data",
            matches: [
                { 
                    uid: "mock_1", 
                    username: "Sarah_Casual", 
                    rank: 1200, 
                    playStyle: "Casual", 
                    compatibility_score: 0.2 // Perfect Match color
                },
                { 
                    uid: "mock_2", 
                    username: "Pro_Gamer_X", 
                    rank: 14000, 
                    playStyle: "14k Spammer", 
                    compatibility_score: 1.8 // Okay Match color
                }
            ]
        };
    }
};