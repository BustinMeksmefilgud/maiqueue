import {
    FaceSmileIcon,
    FireIcon,
    BoltIcon,
    UserIcon,
    UserPlusIcon,
    TrashIcon
} from '@heroicons/react/24/solid';
import goku from '../assets/you-fucked.gif'
import { useEffect, useState } from "react";
import { collection, onSnapshot, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserStatus, BranchCode } from "../model/Enums";
import { leaveWaitingList, seedMockQueue, seedWaitingList } from '../service/QueueService';
import { seedTheething, deleteTheeThing } from '../service/AiService';

export default function Admin({ user }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const statusColors = {
        [UserStatus.PLAYING]: "bg-green-500",
        [UserStatus.IN_QUEUE]: "bg-blue-500",
        [UserStatus.WAITING]: "bg-yellow-500",
        [UserStatus.OFFLINE]: "bg-zinc-500",
    };

    const playIcons = {
        "Casual": FaceSmileIcon,
        "Chiho Grinder": FireIcon,
        "14k Spammer": BoltIcon,
        "Lone Wolf": UserIcon,
        "Solo Boring": UserPlusIcon
    };

    useEffect(() => {
        let unsubscribe = () => { };

        if (user?.isAdmin) {
            setLoading(true);
            // 2. Setup the Listener
            const usersRef = collection(db, "users");

            unsubscribe = onSnapshot(usersRef, (snapshot) => {
                const userList = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));

                userList.sort((a, b) => {
                    if (a.status === 'PLAYING' && b.status !== 'PLAYING') return -1;
                    if (a.status !== 'PLAYING' && b.status === 'PLAYING') return 1;
                    return 0;
                });
                setUsers(userList);
                setLoading(false);
            }, (error) => {
                console.error("Error fetching users:", error);
                setLoading(false);
            });
        }

        // 3. Cleanup: Stop listening when admin leaves the page
        return () => unsubscribe();
    }, [user]);
    const getRankColor = (rating) => {
        // 15000+ (Rainbow / Prismatic)
        if (rating >= 15000) return "bg-gradient-to-r from-teal-200 via-yellow-200 to-pink-300 text-purple-900 border-purple-300";

        // 14500 - 14999 (Platinum / White Gold)
        if (rating >= 14500) return "bg-gradient-to-r from-yellow-100 to-orange-100 text-yellow-900 border-yellow-300";

        // 14000 - 14499 (Gold)
        if (rating >= 14000) return "bg-gradient-to-r from-yellow-400 to-yellow-600 text-yellow-950 border-yellow-700";

        // 13000 - 13999 (Silver / Blue-ish Silver)
        if (rating >= 13000) return "bg-gradient-to-r from-sky-300 to-blue-400 text-blue-950 border-blue-500";

        // 12000 - 12999 (Bronze)
        if (rating >= 12000) return "bg-gradient-to-r from-orange-700 to-red-800 text-white border-red-900";

        // 10000 - 11999 (Purple)
        if (rating >= 10000) return "bg-purple-600 text-purple-100 border-purple-800";

        // 7000 - 9999 (Red)
        if (rating >= 7000) return "bg-red-500 text-white border-red-700";

        // 4000 - 6999 (Yellow / Orange)
        if (rating >= 4000) return "bg-yellow-500 text-yellow-950 border-yellow-700";

        // 2000 - 3999 (Green)
        if (rating >= 2000) return "bg-emerald-500 text-emerald-950 border-emerald-700";

        // 1000 - 1999 (Blue)
        if (rating >= 1000) return "bg-blue-500 text-white border-blue-700";

        // 0 - 999 (White / Light Blue)
        return "bg-slate-200 text-slate-700 border-slate-400";
    };

    const handleDeleteUser = async (targetUserId) => {
        if (!window.confirm("Are you sure you want to PERMANENTLY delete this user?")) return;

        try {
            await deleteDoc(doc(db, "users", targetUserId));
            setUsers(users.filter(u => u.id !== targetUserId));

        } catch (e) {
            alert("Error deleting user: " + e);
        }
    }

    // 3. Filter Logic for Search
    const filteredUsers = users.filter(u =>
        u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // --- SECURITY CHECK ---
    if (!user || !user.isAdmin) {
        return (
            <div className="h-screen flex items-center justify-center text-zinc-300">

                <div className="text-center">
                    <img src={goku} alt="Cool animation" className="rounded-lg shadow-xl" />
                    <p>You're not supposed to be here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-teal-100">User Database</h1>
                    <p className="text-teal-500 text-sm">Total Users: {users.length}</p>
                </div>

                {/* Search Bar */}
                <input
                    type="text"
                    placeholder="Search username or email..."
                    className="input input-bordered w-full md:w-80 bg-black/20 border-zinc-700 p-3"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <button
                onClick={() => seedTheething()}
                className="btn btn-xs btn-outline btn-error"
            >
                Add Mock Queue Data
            </button>
             <button
                onClick={() => seedWaitingList(BranchCode.SISA)}
                className="btn btn-xs btn-outline btn-error"
            >
                Add people to waitinglist
            </button>
            <button
                onClick={() => seedMockQueue(BranchCode.SISA)}
                className="btn btn-xs btn-outline btn-error"
            >
                Add people to queue
            </button>
            <button
                onClick={() => deleteTheeThing()}
                className="btn btn-xs btn-outline btn-error"
            >
                Delete Mock Queue Data
            </button>
            <div className="overflow-x-auto bg-zinc-900/50 rounded-xl border border-white/5 shadow-xl">
                <table className="table w-full">
                    {/* Table Head */}
                    <thead className="bg-black/40 text-zinc-400 uppercase text-xs font-bold tracking-wider">
                        <tr>
                            <th>User</th>
                            <th>Actions</th>
                        </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="text-center py-8">
                                    <span className="loading loading-spinner text-teal-500"></span>
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                    <td>
                                        <div className="flex items-center gap-3">
                                            <div className="avatar placeholder">
                                                <div className={`${statusColors[u.status]} rounded-full w-10 p-2.5`}>
                                                    {(() => {
                                                        const IconComponent = playIcons[u.playStyle] || FaceSmileIcon;
                                                        return <IconComponent className="w-5 h-5" />;
                                                    })()}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex flex-row gap-3">
                                                    <div className="font-bold text-zinc-200">
                                                        {u.username.length > 8
                                                            ? `${u.username.slice(0, 8)}...`
                                                            : u.username
                                                        }
                                                    </div>
                                                    <span className={`badge badge-md font-black border ${getRankColor(u.rank)}`}>
                                                        {u.rank || "Unranked"}
                                                    </span>
                                                </div>
                                                <div className="text-sm opacity-50 max-w-[150px] truncate" title={u.email}>
                                                    {u.email}
                                                </div>
                                                {u.isAdmin && <span className="badge badge-xs badge-warning mt-1">ADMIN</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => handleDeleteUser(u.id)}
                                            className="btn btn-xs btn-outline btn-error"
                                        >
                                            <TrashIcon className='w-5 h-5 text-red-700' />
                                        </button>
                                         <button
                                            onClick={() => leaveWaitingList(u.id)}
                                            className="btn btn-xs btn-outline btn-error"
                                        >
                                            <UserIcon className='w-5 h-5 text-yellow-500' />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>

                {!loading && filteredUsers.length === 0 && (
                    <div className="text-center py-10 text-zinc-500">
                        No users found matching "{searchTerm}"
                    </div>
                )}
            </div>
        </div>
    );
}