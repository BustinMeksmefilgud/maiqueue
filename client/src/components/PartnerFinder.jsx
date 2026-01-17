import { useState } from 'react';
import { findPartner } from '../service/AiService';

export default function PartnerFinder({ user, branchId }) {
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [error, setError] = useState("");

    const handleSearch = async () => {
        setLoading(true);
        setError("");
        setIsOpen(true); // Open modal immediately
        
        try {
            const data = await findPartner(user.uid, branchId);
            setMatches(data.matches || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (partnerName, partnerUid) => {
        if(window.confirm(`Start a Sync game with ${partnerName}?`)) {
            // try {
            //     // For now, we reuse the "Pair Host with Guest" logic 
            //     // In a full app, you'd send an invite notification first.
            //     await pairHostWithGuest(user.uid, branchId, partnerName); 
            //     alert("Paired successfully!");
            //     setIsOpen(false);
            // } catch (e) {
            //     alert(e);
            // }
            console.log("Sending them a pipebomb")
        }
    }

    // Helper to color-code the AI Score
    // Lower Distance = Better Match
    const getMatchQuality = (dist) => {
        if (dist < 0.5) return { label: "PERFECT MATCH", color: "badge-success" };
        if (dist < 1.5) return { label: "GOOD MATCH", color: "badge-primary" };
        return { label: "OKAY MATCH", color: "badge-warning" };
    };

    return (
        <>
            {/* 1. THE TRIGGER BUTTON */}
            <button 
                className="btn btn-outline btn-secondary w-full gap-2"
                onClick={handleSearch}
                disabled={loading}
            >
                {loading ? <span className="loading loading-spinner"></span> : '' }
                Solo Boring? Find a Partner
            </button>

            {/* 2. THE MODAL */}
            {isOpen && (
                <div className="modal modal-open">
                    <div className="modal-box relative border border-slate-700 bg-red-900">
                        <button 
                            className="btn btn-sm btn-circle absolute right-2 top-2"
                            onClick={() => setIsOpen(false)}
                        >✕</button>
                        
                        <h3 className="text-lg font-bold text-secondary mb-4 flex items-center gap-2">
                                Partner Finder
                        </h3>

                        {loading && (
                            <div className="py-10 text-center text-slate-400">
                                <span className="loading loading-dots loading-lg mb-2"></span>
                                <p>Analyzing playstyles & ranks...</p>
                            </div>
                        )}

                        {!loading && error && (
                            <div className="alert alert-error text-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span>{error}</span>
                            </div>
                        )}

                        {!loading && !error && matches.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                <p>No available partners in the waiting list.</p>
                                <p className="text-xs mt-2">Try waiting for more people to join.</p>
                            </div>
                        )}

                        {/* 3. MATCH LIST */}
                        <div className="flex flex-col gap-3 mt-2">
                            {matches.map((m) => {
                                const quality = getMatchQuality(m.compatibility_score);
                                return (
                                    <div key={m.uid} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg border border-slate-700 hover:border-secondary transition-colors">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-white">{m.username}</span>
                                                <div className={`badge ${quality.color} badge-xs font-mono`}>
                                                    {quality.label}
                                                </div>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1 flex gap-3">
                                                <span>Rank: {m.rank}</span>
                                                <span>Style: {m.playStyle}</span>
                                                <span className="text-slate-500" title="Euclidean Distance">
                                                    Dist: {m.compatibility_score}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            className="btn btn-sm btn-primary"
                                            onClick={() => handleInvite(m.username, m.uid)}
                                        >
                                            Pair
                                        </button>
                                    </div>
                                )
                            })}
                        </div>

                    </div>
                    {/* Click outside to close */}
                    <div className="modal-backdrop" onClick={() => setIsOpen(false)}></div>
                </div>
            )}
        </>
    );
}