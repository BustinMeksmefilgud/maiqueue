import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from "react-router-dom";
import BranchSwitcher from "../components/BranchSwitcher";
import GameTimer from "../components/GameTimer";
import PartnerFinder from '../components/PartnerFinder';
import {
    addToWaitingList,
    addGuestToWaitingList,
    subscribeToWaitingList,
    getBranchCapacity,
    getMyGuests,
    subscribeToQueue,
    leaveWaitingList,
    removeGuestFromList,
    joinQueue,
    leaveQueue,
    removeQueue,
    startGame,
    finishGame,
    addGuestSolo,
    pairHostWithGuest
} from '../service/QueueService.jsx';
import { getEstimatedWaitTime } from '../service/AiService.jsx';
import { UserStatus, QueueType, QueueStatus } from "../model/Enums.jsx";

export default function Queue({ user }) {

    const [viewBranch, setViewBranch] = useState(() => {
        const saved = localStorage.getItem("selectedBranch");
        return saved || user?.branchId;
    });
    const [loading, setLoading] = useState(false)
    const [queueData, setQueueData] = useState([])
    const [waitingList, setWaitingList] = useState([])
    const [guestName, setGuestName] = useState("")
    const [myGuests, setMyGuests] = useState([])
    const [machineCapacity, setMachineCapacity] = useState(1);

    const [etLoading, setEtLoading] = useState(false)
    const [aiWaitTime, setAiWaitTime] = useState(null);
    const [aiMethod, setAiMethod] = useState("");

    const activeGames = queueData.filter(q => q.status === QueueStatus.PLAYING);
    const upcomingQueue = queueData.filter(q => q.status === QueueStatus.QUEUED);
    const isMachineBusy = activeGames.length >= machineCapacity;

    const amIWaiting = waitingList.some(p => p.uid === user?.uid);

    const myActiveSession = activeGames.find(q => q.playerIds.includes(user?.uid));
    const myQueueItem = upcomingQueue.find(q => q.playerIds.includes(user?.uid));

    const isUserNext = !myActiveSession && upcomingQueue.length > 0 && upcomingQueue[0].playerIds.includes(user?.uid);


    const handleBranchChange = (newBranchCode) => {
        setViewBranch(newBranchCode);
        localStorage.setItem("selectedBranch", newBranchCode);
    };

    const handleGuestAction = async (actionType) => {
        if (!guestName.trim()) return;
        setLoading(true);
        try {
            if (actionType === 'SOLO') {
                // Create guest -> Put in Solo Queue
                await addGuestSolo(user.uid, viewBranch, guestName);
            }
            else if (actionType === 'PAIR') {
                // Create guest -> Pair with ME -> Put in Sync Queue
                await pairHostWithGuest(user.uid, viewBranch, guestName);
            }
            else if (actionType === 'WAITLIST') {
                // Old logic: Just add to waiting list
                await addGuestToWaitingList(guestName, viewBranch, user.uid);
            }
            setGuestName(""); // Clear input
        } catch (e) {
            alert(e);
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async (mode) => {
        if (!user || !viewBranch) return;

        try {
            setLoading(true);
            await joinQueue(user.uid, viewBranch, mode, machineCapacity);
        } catch (e) {
            alert("Could not join queue: " + e);
        } finally {
            setLoading(false);
        }
    }

    const handleLeaveQueue = async () => {
        if (!myQueueItem) return;
        try {
            setLoading(true);
            await leaveQueue(user.uid, myQueueItem.id);
        } catch (e) {
            alert("Error leaving queue: " + e);
        } finally {
            setLoading(false);
        }
    };

    const onGameStart = async (queue) => {
        if (!upcomingQueue[0]) return;
        try {
            setLoading(true);
            await startGame(queue.id, queue.playerIds);
        } catch (e) {
            alert("Error starting game: " + e);
        } finally {
            setLoading(false);
        }
    };

    // Timer so players don't just keep playing until the earth explodes
    useEffect(() => {
        const intervalId = setInterval(() => {
            if (!user) return;
            activeGames.forEach(game => {
                if (game.startedAt) {
                    const startTime = game.startedAt.toDate ? game.startedAt.toDate() : new Date(game.startedAt);
                    const now = new Date();
                    const diffInMinutes = (now - startTime) / 1000 / 60;
                    console.log('Time left', diffInMinutes)
                    // If game has been running for > 20 mins, auto-finish it
                    if (diffInMinutes >= 20) {
                        console.log(`My game timed out. Auto-ending session ${game.id}.`);
                        finishGame(game.id, game.playerIds);
                    }
                }
            });
        }, 60000); // Check every 60 seconds

        return () => clearInterval(intervalId);
    }, [activeGames, user]);

    useEffect(() => {
        if (!viewBranch) {
            setQueueData([]);
            setWaitingList([]);
            setMyGuests([]);
            return;
        }
        const unsubWaiting = subscribeToWaitingList((newUsers) => {
            console.log("Waiting list updated:", newUsers);
            setWaitingList(newUsers);
        }, viewBranch);

        const unsubQueue = subscribeToQueue((newUsers) => {
            console.log("Queue list updated:", newUsers);
            setQueueData(newUsers);
        }, viewBranch);

        let unsubGuests = () => { };

        if (user?.uid) {
            unsubGuests = getMyGuests((newGuests) => {
                console.log("Adding guests", newGuests);
                setMyGuests(newGuests);
            }, user.uid); // <--- PASS USER ID HERE
        }
        // 2. Cleanup: Stop listening when user leaves the page
        return () => {
            unsubQueue();
            unsubWaiting();
            unsubGuests();
        };
    }, [viewBranch, user?.uid]);

    useEffect(() => {
        const fetchCapacity = async () => {
            if (viewBranch) {
                const cap = await getBranchCapacity(viewBranch);
                setMachineCapacity(cap);
            }
        };
        fetchCapacity();
    }, [viewBranch]);

    useEffect(() => {
        const fetchWaitTime = async () => {
            setEtLoading(true)
            if (viewBranch) {
                // Pass the viewBranch (e.g., "sisa")
                const data = await getEstimatedWaitTime(viewBranch, user?.uid);
                if (data) {
                    setAiWaitTime(data.estimated_minutes);
                    setAiMethod(data.method);
                }
                console.log("Method: ", aiMethod)
            }
            setEtLoading(false)
        };

        // Call it immediately, and whenever queueData updates
        fetchWaitTime();

    }, [queueData, viewBranch]);

    return (
        <div className="p-6 w-full max-w-md mx-auto">
            {/* <div className="flex justify-between items-center mb-4">
                Dislcaimer: Early Stages, might break. Estimated Wait Time and Partner Finder aren't active
            </div> */}
            <div className="flex flex-col justify-between items-center mb-4">
                {user?.isGuest && (
                    <h1 className="text-2xl font-bold text-teal-100">Guest Mode</h1>
                )}
                {user?.isAdmin && (
                    <>
                        <h1 className="text-2xl font-bold text-teal-100">Admin Mode</h1>
                        <div className="text-xs mt-2 mb-4 py-2">
                            With great power and all that jazz, Be careful what you change
                        </div>
                        <Link to="/admin" className="text-s font-bold text-teal-100">
                            Admin
                        </Link>
                    </>
                )}
                <BranchSwitcher currentBranch={viewBranch} onBranchChange={handleBranchChange} />

                {user?.branchId && user.branchId !== viewBranch && user.status === UserStatus.WAITING && (
                    <div className="text-xs mt-2 mb-4 py-2">
                        <span>
                            You are waiting at <b>{user.branchId}</b>, but viewing <b>{viewBranch}</b>.
                        </span>
                    </div>
                )}
            </div>
            <div className="mb-6">
                <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                        <h2 className="text-sm font-bold text-teal-400 uppercase tracking-widest">Now Playing</h2>
                        <span className="text-xs text-zinc-400">
                            {activeGames.length} / {machineCapacity} Machines Active
                        </span>
                    </div>

                    <div className="grid gap-3">
                        {Array.from({ length: machineCapacity }).map((_, index) => {
                            const game = activeGames[index];
                            if (game) {
                                return (
                                    <div key={game.id} className="bg-gradient-to-r from-emerald-900 to-teal-900 p-5 rounded-2xl shadow-lg border border-emerald-700/50 relative overflow-hidden">
                                        <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 blur-3xl rounded-full pointer-events-none"></div>
                                        <div className="flex justify-between items-center z-10 relative">
                                            <div>
                                                <h3 className="text-2xl font-black text-white tracking-tight">
                                                    {game.playerNames.map(name =>
                                                        name.length > 8 ? name.substring(0, 8) + "..." : name
                                                    ).join(" & ")}
                                                </h3>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="badge badge-sm bg-black/30 border-none text-white/70">
                                                        {game.type}
                                                    </span>
                                                    <span className="text-xs text-emerald-200 animate-pulse">
                                                        • Cab {index + 1} Busy
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right bg-black/20 p-2 rounded-lg border border-white/5 backdrop-blur-sm">
                                                {game.startedAt ? (
                                                    <GameTimer startTime={game.startedAt} />
                                                ) : (
                                                    <span className="loading loading-dots loading-xs text-white"></span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )
                            } else {
                                return (
                                    <div key={`empty-${index}`} className="p-5 rounded-2xl bg-black/20 border-2 border-dashed border-zinc-700/50 flex items-center justify-between text-zinc-500">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                                                <span className="font-bold text-teal-300">{index + 1}</span>
                                            </div>
                                            <span className="font-bold text-cyan-300">Machine {index + 1} Available</span>
                                        </div>
                                        <div className="badge badge-ghost text-xs">OPEN</div>
                                    </div>
                                )
                            }
                        })}
                    </div>
                </div>
            </div>

            {(myActiveSession || activeGames.length > 0 && user?.isAdmin) && (
                <div className="mb-6">
                    <button
                        className="btn btn-lg btn-error w-full shadow-xl border-red-500 text-white font-black uppercase tracking-wider animate-pulse"
                        onClick={() => {
                            const gameToEnd = myActiveSession || activeGames[0];
                            if (gameToEnd) finishGame(gameToEnd.id, gameToEnd.playerIds);
                        }}
                        disabled={loading}
                    >
                        🏁 Finish Game
                    </button>
                    <p className="text-center text-xs text-cyan-500 mt-2">
                        Game will auto-end after 20 minutes.
                    </p>
                </div>
            )}

            {upcomingQueue.length > 0 && !myActiveSession && (isUserNext || user?.isAdmin) && (
                <>
                    <div className="mb-6 animate-bounce">
                        <button
                            disabled={loading || isMachineBusy}
                            className={`btn btn-lg w-full shadow-xl font-black uppercase tracking-wider ${isMachineBusy
                                ? "btn-disabled bg-zinc-800 text-zinc-500 border-zinc-700"
                                : "btn-warning border-teal-500 text-emerald-500 shadow-orange-900/20"
                                }`}
                            onClick={() => onGameStart(upcomingQueue[0])}
                        >
                            {isMachineBusy ? "Waiting for them to finish..." : "It's Your Turn! Start Game"}
                        </button>
                    </div>
                    {!isMachineBusy && upcomingQueue.length > 1 && (
                        <button
                            disabled={loading || isMachineBusy}
                            className={`btn btn-lg w-full shadow-xl font-black uppercase tracking-wider ${isMachineBusy
                                ? "btn-disabled bg-zinc-800 text-zinc-500 border-zinc-700"
                                : "btn-warning border-amber-500 text-amber-500 shadow-orange-900/20"
                                }`}
                            onClick={() => onGameStart(upcomingQueue[1])}
                        >
                            Or skip turn?
                        </button>
                    )}
                </>
            )}

            {/* --- SECTION 1: ACTIVE QUEUE --- */}
            <div className="flex justify-between items-center my-4">
                <h1 className="text-2xl font-bold text-teal-100">Current Queue</h1>
                {queueData.length > 0 && (
                    <>
                        {!etLoading && aiWaitTime !== null ? (
                            <div
                                className={`badge gap-1 mt-1 font-mono text-xs p-3 ${aiMethod.includes('ai') ? 'badge-primary text-blue-100' : 'badge-warning'
                                    }`}
                                title={`Calculation Method: ${aiMethod}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                                </svg>
                                {/* Round up so users don't see "12.3 minutes" */}
                                {Math.ceil(aiWaitTime)} min wait
                            </div>
                        ) : (
                            <div clasName="badge gap-1 mt-1 font-mono text-xs p-3">Loading...</div>
                        )}
                    </>
                )}
            </div>

            <div className="mb-8">
                <div className="flex justify-between items-end mb-2">
                    <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Up Next</h2>
                    <span className="text-xs text-zinc-400">{upcomingQueue.length} groups waiting</span>
                </div>

                <div className="flex flex-col gap-2">
                    {upcomingQueue.map((q, index) => {
                        const myGuestInThisQueue = myGuests.find(g => q.playerIds.includes(g.uid));
                        const isMyGuestNext = index === 0 && myGuestInThisQueue;
                        return (
                            <div key={q.id} className="card bg-teal-900 border border-teal-100 p-4 flex-row relative items-center justify-between shadow-sm">

                                {/* Left: Info */}
                                <div className="flex items-center gap-3">
                                    {/* Position Number */}
                                    <div className="font-mono text-yellow-500 text-sm w-4">#{index + 1}</div>

                                    <div className="flex-col items-start">
                                        <h4 className={`font-bold text-lg leading-tight text-left ${q.playerIds.includes(user?.uid) ? 'text-teal-500' : 'text-zinc-200'}`}>
                                            {q.playerNames.join(" & ")}
                                        </h4>

                                        <div className="mt-1">
                                            {q.type === QueueType.SYNC ? (
                                                <span className="badge badge-xs badge-secondary bg-purple-500/20 text-purple-200 border-none">
                                                    SYNC
                                                </span>
                                            ) : (
                                                <span className="badge badge-xs badge-primary bg-blue-500/20 text-blue-200 border-none">
                                                    SOLO
                                                </span>
                                            )}
                                            {myGuestInThisQueue && (
                                                <span className="badge badge-xs badge-outline text-purple-300">
                                                    Guest: {myGuestInThisQueue.username}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Status/Icon */}
                                {user?.isAdmin && !myGuestInThisQueue && (
                                    <button
                                        className="btn btn-ghost btn-xs btn-circle text-red-400 hover:bg-red-900/50 ml-1"
                                        onClick={() => removeQueue(q.id)}
                                        title="Remove Queue"
                                    >
                                        ✕
                                    </button>
                                )}
                                {myGuestInThisQueue && !q.playerIds.includes(user?.uid) && (
                                    <div className="flex flex-col gap-1 items-end">

                                        {/* 1. START GAME BUTTON (Only if they are 1st in line) */}
                                        {!isMachineBusy && isMyGuestNext && (
                                            <button
                                                className="btn btn-xs btn-warning animate-pulse"
                                                onClick={() => onGameStart(q)}
                                                disabled={loading}
                                            >
                                                +
                                            </button>
                                        )}

                                        {/* 2. LEAVE QUEUE BUTTON */}
                                        <button
                                            className="btn btn-xs btn-error btn-outline"
                                            onClick={() => leaveQueue(myGuestInThisQueue.uid, q.id)} // <--- Pass Guest UID
                                            disabled={loading}
                                        >
                                            x
                                        </button>
                                    </div>
                                )}
                            </div>
                        )

                    })}

                    {upcomingQueue.length === 0 && (
                        <div className="text-center py-4 text-cyan-300 italic text-sm">
                            Queue is empty. Be the first!
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-xl font-bold text-zinc-300">Waiting Area</h2>
            </div>
            <div className="bg-black/20 rounded-xl p-4 border border-white/5 mb-6">
                <div className="flex flex-wrap gap-2">
                    {waitingList.map((p) => (
                        <div key={p.id} className="badge badge-lg badge-neutral gap-2 p-4 text-zinc-200">
                            <div className={`w-2 h-2 rounded-full ${p.uid === user?.uid ? 'bg-emerald-500' : 'bg-yellow-400'}`} />
                            {p.username.length > 8
                                ? `${p.username.slice(0, 8)}...`
                                : p.username
                            }
                            {p.addedBy === user?.uid ? (
                                <button
                                    className="btn btn-ghost btn-xs btn-circle text-red-400 hover:bg-red-900/50 ml-1"
                                    onClick={() => removeGuestFromList(p.uid)}
                                    title="Remove Guest"
                                >
                                    ✕
                                </button>
                            ) : (
                                <span className="w-1"></span>
                            )}
                        </div>

                    ))}
                    {waitingList.length === 0 && (
                        <p className="text-sm text-zinc-500 w-full text-center">No one is waiting.</p>
                    )}
                </div>
            </div>


            {/* ACTION BUTTONS  */}

            {user?.branchId && (user.status === UserStatus.OFFLINE || user.branchId == viewBranch) && (

                <div className="flex flex-col gap-3 mt-5">
                    <h3 className="text-xl font-bold text-zinc-300">Join Queue</h3>
                    {myQueueItem && (
                        <button
                            className="btn btn-error btn-outline shadow-lg w-full mb-4"
                            onClick={handleLeaveQueue}
                            disabled={loading}
                        >
                            {loading && <span className="loading loading-spinner loading-xs"></span>}
                            Exit Queue
                        </button>
                    )}
                    {!myActiveSession && user?.branchId && user.status == UserStatus.WAITING && (
                        <div className="grid grid-cols-2 gap-4">
                            <button className="btn btn-primary shadow-lg shadow-teal-900/50 border-none text-white"
                                onClick={() => handleJoin(QueueType.SOLO)}
                                disabled={loading}>
                                {loading && <span className="loading loading-spinner loading-xs"></span>}
                                Solo
                            </button>
                            <button className="btn btn-primary shadow-lg shadow-teal-900/50 border-none text-white"
                                onClick={() => handleJoin(QueueType.SYNC)}
                                disabled={loading}>
                                {loading && <span className="loading loading-spinner loading-xs"></span>}
                                Sync
                            </button>
                        </div>
                    )}

                    {user?.status === UserStatus.WAITING && (
                        <div className="mt-4">
                            <PartnerFinder user={user} branchId={viewBranch} />
                        </div>
                    )}


                    {!myQueueItem && !myActiveSession && (
                        <>
                            {amIWaiting ? (
                                <button className="btn btn-error btn-sm text-red-600 hover:bg-red-900" onClick={() => leaveWaitingList(user.uid)}>
                                    Leave Waiting List
                                </button>
                            ) : (
                                <button className="btn btn-outline btn-sm text-teal-200 hover:bg-teal-900 hover:border-teal-500" onClick={() => addToWaitingList(user.uid, viewBranch)}>
                                    Join Waiting List (AFK)
                                </button>
                            )}
                        </>
                    )}

                    {/* <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            placeholder="Guest"
                            className="input input-bordered w-full p-3 text-emerald-950"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            required
                        />
                        <button className="btn btn-outline btn-sm text-teal-200 hover:bg-teal-900 hover:border-teal-500" onClick={() => addGuestToWaitingList(guestName, viewBranch, user.uid)}>
                            Add Guest
                        </button>
                    </div> */}

                    {user?.branchId && (user.status !== UserStatus.IN_QUEUE || user.branchId == viewBranch) && (
                        <div className="flex flex-col gap-6">

                            {/* 2. DIRECT ACTIONS */}
                            <div className="bg-zinc-900/80 border border-zinc-700 rounded-xl p-4 shadow-xl">
                                <h3 className="text-teal-200 font-bold mb-3 text-sm uppercase tracking-wide">
                                    Guest Actions
                                </h3>

                                {/* B. Guest Quick Play */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-zinc-500">PLAY WITH GUEST</label>
                                    <input
                                        type="text"
                                        placeholder="Guest Name..."
                                        className="input input-bordered input-sm w-full bg-black/40 text-white p-3"
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                    />

                                    <div className="grid grid-cols-2 gap-2">
                                        {/* Option 1: Guest plays alone */}
                                        <button
                                            className="btn btn-outline btn-accent btn-sm"
                                            disabled={!guestName.trim() || loading}
                                            onClick={() => handleGuestAction('SOLO')}
                                        >
                                            Guest Solo
                                        </button>

                                        {/* Option 2: Guest plays WITH ME */}
                                        <button
                                            className="btn btn-accent btn-sm text-white shadow-lg shadow-emerald-900/50"
                                            disabled={!guestName.trim() || loading || user.status === UserStatus.IN_QUEUE} // Can't pair if I am busy
                                            onClick={() => handleGuestAction('PAIR')}
                                        >
                                            Play with Me
                                        </button>
                                    </div>

                                    {/* Option 3: Fallback */}
                                    <button
                                        className="btn btn-ghost btn-xs text-zinc-500 mt-1"
                                        disabled={!guestName.trim() || loading}
                                        onClick={() => handleGuestAction('WAITLIST')}
                                    >
                                        Just add to waiting list
                                    </button>
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            )}


        </div>
    );
}