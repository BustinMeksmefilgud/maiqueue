import { auth, db } from "../firebase"; // <--- Import db
import {
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  arrayUnion,
  increment,
  writeBatch,
  limit
} from "firebase/firestore";
import { User } from "../model/User";
import { QueueItem } from "../model/Queue";
import { UserStatus, QueueType, QueueStatus, BranchCode, PlayStyle } from "../model/Enums.jsx";

export const subscribeToWaitingList = (callback, branch) => {
  const q = query(
    collection(db, "users"),
    where("status", "==", UserStatus.WAITING),
    where("branchId", "==", branch),
    orderBy("createdAt", "asc")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {

    const waitingUsers = snapshot.docs.map(doc => {
      return new User({ uid: doc.id, ...doc.data() });
    });
    callback(waitingUsers);
  });

  return unsubscribe;
};

export const subscribeToQueue = (callback, branchId) => {
  const q = query(
    collection(db, "queue"),
    where("status", "in", [QueueStatus.QUEUED, QueueStatus.PLAYING]),
    where("branchId", "==", branchId),
    orderBy("createdAt", "asc")
  )

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const queueData = snapshot.docs.map(doc => {
      return new QueueItem({ id: doc.id, ...doc.data() });
    });

    callback(queueData);
  });

  return unsubscribe;
}

export const getBranchCapacity = async (branchId) => {
  try {
    const docRef = doc(db, "branches", branchId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      // Return the count, or default to 1 if the field is missing
      return data.cabinetCount || 1;
    } else {
      console.warn(`Branch ${branchId} not found, defaulting to 1 machine.`);
      return 1;
    }
  } catch (e) {
    console.error("Error fetching branch capacity:", e);
    return 1; // Safe default
  }
};

export const addGuestToWaitingList = async (guestName, branch, uid) => {
  const GUEST_LIMIT = 2;

  try {
    const q = query(
      collection(db, "users"),
      where("addedBy", "==", uid),
      where("status", "==", UserStatus.WAITING)
    );

    const snapshot = await getDocs(q);

    if (snapshot.size >= GUEST_LIMIT) {
      alert(`You can only add ${GUEST_LIMIT} guests.`);
      return;
    }
    const newGuestRef = doc(collection(db, "users"));
    const guestUser = new User({
      uid: newGuestRef.id,
      username: guestName,
      isGuest: true,
      status: UserStatus.WAITING,
      branchId: branch,
      addedBy: uid
    })
    await setDoc(newGuestRef, guestUser.toFirestore());
  } catch (e) {
    console.error("Error adding guest: ", e)
  }
}

export const addToWaitingList = async (userId, branch) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      status: UserStatus.WAITING,
      branchId: branch
    });
  } catch (e) {
    console.error("Error joining waiting list: ", e)
  }
}

export const leaveWaitingList = async (userId) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      status: UserStatus.OFFLINE,
      currentQueueId: null
    });
  } catch (e) {
    console.error("Error switching branch:", e);
    throw error;
  }
}

export const removeGuestFromList = async (guest) => {
  try {
    const ref = doc(db, "users", guest);
    await deleteDoc(ref);
  } catch (error) {
    console.error("Error deleting guest:", error);
    throw error;
  }
};

export const joinQueue = async (userId, branchId, mode, cabCount = 1) => {
  try {
    let candidateSessionId = null;
    let isMachineFree = false

    const qActive = query(
      collection(db, "queue"),
      where("branchId", "==", branchId),
      where("status", "==", QueueStatus.PLAYING),
    );
    const activeSnap = await getDocs(qActive);
    const busyCabsCount = activeSnap.size;
    if (busyCabsCount < cabCount) {
      isMachineFree = true;
    }

    const qLineCheck = query(
      collection(db, "queue"),
      where("branchId", "==", branchId),
      where("status", "==", QueueStatus.QUEUED),
      limit(1) 
    );
    const lineSnap = await getDocs(qLineCheck);
    
    // Is the line empty?
    const isLineEmpty = lineSnap.empty;

    console.log("Machine", isMachineFree, "Queue Empty", isLineEmpty)

    if (mode === QueueType.SYNC) {
      const q = query(
        collection(db, "queue"),
        where("branchId", "==", branchId),
        where("status", "==", QueueStatus.QUEUED),
        where("type", "==", QueueType.SYNC),
        where("playerCount", "==", 1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        candidateSessionId = snapshot.docs[0].id;
      }
    }
    await runTransaction(db, async (transaction) => {
      const userRef = doc(db, "users", userId);
      const userSnap = await transaction.get(userRef);

      if (!userSnap.exists()) throw "User profile not found!";

      const userData = userSnap.data();
      const myUsername = userData.username || "Unknown Player";


      if (userData.status !== UserStatus.WAITING) {
        throw "You must join the Waiting List before joining the Queue!";
      }

      if (userData.status === UserStatus.IN_QUEUE || userData.status === UserStatus.PLAYING) {
        throw "You are already in a queue!";
      }

      let sessionRefToJoin = null;

      if (candidateSessionId) {
        const candidateRef = doc(db, "queue", candidateSessionId)
        const candidateSnap = await transaction.get(candidateRef);

        if (candidateSnap.exists()) {
          const sessionData = candidateSnap.data();
          if (sessionData.playerCount < 2) {
            sessionRefToJoin = candidateRef;
          }
        }
      }

      if (sessionRefToJoin) {

        const shouldStart = isMachineFree && isLineEmpty

        transaction.update(sessionRefToJoin, {
          players: arrayUnion(userId),
          playerNames: arrayUnion(myUsername),
          playerCount: increment(1),
          ...(shouldStart && {
            status: QueueStatus.PLAYING,
            startedAt: serverTimestamp()
          })
        });

        transaction.update(userRef, {
          status: shouldStart ? UserStatus.PLAYING : UserStatus.IN_QUEUE,
          currentQueueId: sessionRefToJoin.id
        });

        console.log(`Joined existing Sync session: ${sessionRefToJoin.id}`);
      } else {
        const newSessionRef = doc(collection(db, "queue"));

        const shouldStartNow = isMachineFree && isLineEmpty && mode === QueueType.SOLO;

        const initialStatus = shouldStartNow ? QueueStatus.PLAYING : QueueStatus.QUEUED;
        const initialStartedAt = shouldStartNow ? serverTimestamp() : null;

        const newSessionData = {
          sessionId: newSessionRef.id,
          branchId: branchId,
          type: mode, // SOLO or SYNC
          status: initialStatus,

          // Arrays for flexible player management
          players: [userId],
          playerNames: [myUsername],
          playerCount: 1,

          createdAt: serverTimestamp(),
          startedAt: initialStartedAt,
          endedAt: null
        }

        transaction.set(newSessionRef, newSessionData);

        // Link user to this new session
        transaction.update(userRef, {
          status: isMachineFree ? UserStatus.PLAYING : UserStatus.IN_QUEUE,
          currentQueueId: newSessionRef.id
        });

        console.log(`Created new ${mode} session: ${newSessionRef.id}`);
      }
    });
  } catch (e) {
    console.error("Queue Transaction Failed:", e);
    throw e; // Pass error up to UI
  }
}

export const leaveQueue = async (userId, queueId) => {
  try {
    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, "queue", queueId);
      const userRef = doc(db, "users", userId);

      const sessionSnap = await transaction.get(sessionRef);
      if (!sessionSnap.exists()) throw "Queue session not found!";

      const sessionData = sessionSnap.data();

      const playerRefs = sessionData.players.map(uid => doc(db, "users", uid));
      const playerSnaps = await Promise.all(playerRefs.map(ref => transaction.get(ref)));


      const idsToRemove = [userId];

      playerSnaps.forEach(snap => {
        if (snap.exists()) {
          const pData = snap.data();
          // If this player was added by the user leaving, they go too.
          if (pData.addedBy === userId) {
            idsToRemove.push(pData.uid);
          }
        }
      });


      const newPlayers = sessionData.players.filter(uid => !idsToRemove.includes(uid));
      const newNames = sessionData.playerNames.filter((_, idx) => {
        const uidAtThisIndex = sessionData.players[idx];
        return !idsToRemove.includes(uidAtThisIndex);
      });
      const newCount = newPlayers.length;


      if (newCount === 0) {
        transaction.delete(sessionRef);
      } else {
        transaction.update(sessionRef, {
          players: newPlayers,
          playerNames: newNames,
          playerCount: newCount
        });
      }


      idsToRemove.forEach(uid => {
        const userRef = doc(db, "users", uid);
        transaction.update(userRef, {
          status: UserStatus.WAITING, // Everyone falls back to waiting list
          currentQueueId: null
        });
      });
    });

    console.log("Left queue successfully");

  } catch (e) {
    console.error("Error leaving queue:", e);
    throw e;
  }
};

export const addGuestSolo = async (hostUid, branchId, guestName) => {
  // 1. Create Guest Profile
  const newGuestRef = doc(collection(db, "users"));
  await setDoc(newGuestRef, {
    uid: newGuestRef.id,
    username: guestName,
    isGuest: true,
    status: UserStatus.WAITING, // Set to WAITING so joinQueue accepts them
    branchId: branchId,
    addedBy: hostUid,
    createdAt: serverTimestamp()
  });

  // 2. Immediate Queue Join
  await joinQueue(newGuestRef.id, branchId, QueueType.SOLO);
};

// MODE B: Guest plays WITH Host (Premade Pair)
export const pairHostWithGuest = async (hostUid, branchId, guestName) => {
  try {
    await runTransaction(db, async (transaction) => {
      const hostRef = doc(db, "users", hostUid);
      const hostSnap = await transaction.get(hostRef);
      if (!hostSnap.exists()) throw "Host not found";
      const hostData = hostSnap.data();

      // Host must be available (ONLINE or WAITING)
      if (hostData.status === UserStatus.IN_QUEUE || hostData.status === UserStatus.PLAYING) {
        throw "You are already in a game/queue! Leave first to pair with a guest.";
      }

      // 2. Create Guest (In-Memory for Transaction)
      const newGuestRef = doc(collection(db, "users"));
      const guestData = {
        uid: newGuestRef.id,
        username: guestName,
        isGuest: true,
        status: UserStatus.IN_QUEUE, // Going straight to queue
        branchId: branchId,
        addedBy: hostUid,
        currentQueueId: null, // Will fill below
        createdAt: serverTimestamp()
      };

      // 3. Create a PREMADE Sync Session
      // We do NOT look for existing sessions. We create a private one for this pair.
      const newSessionRef = doc(collection(db, "queue"));
      const newSessionId = newSessionRef.id;

      const sessionData = {
        id: newSessionId,
        branchId: branchId,
        type: QueueType.SYNC,
        status: QueueStatus.QUEUED,
        players: [hostUid, newGuestRef.id],
        playerNames: [hostData.username, guestName], // Snapshot names
        playerCount: 2, // Full immediately
        createdAt: serverTimestamp(),
      };

      // 4. Update Host Data
      guestData.currentQueueId = newSessionId; // Link guest to session

      transaction.set(newGuestRef, guestData); // Create Guest Doc
      transaction.set(newSessionRef, sessionData); // Create Session Doc

      transaction.update(hostRef, { // Update Host Doc
        status: UserStatus.IN_QUEUE,
        currentQueueId: newSessionId
      });
    });
    console.log("Host and Guest paired successfully!");
  } catch (e) {
    console.error("Pairing failed:", e);
    throw e;
  }
};

export const startGame = async (queueId, playerIds) => {
  const batch = writeBatch(db);
  const sessionRef = doc(db, "queue", queueId);

  batch.update(sessionRef, {
    status: QueueStatus.PLAYING,
    startedAt: serverTimestamp()
  });



  playerIds.forEach(uid => {
    const userRef = doc(db, "users", uid);
    batch.update(userRef, {
      status: UserStatus.PLAYING,
    });
  });


  await batch.commit();
};

export const finishGame = async (queueId, playerIds) => {
  const batch = writeBatch(db);

  const sessionRef = doc(db, "queue", queueId);
  batch.update(sessionRef, {
    status: QueueStatus.COMPLETED,
    endedAt: serverTimestamp()
  });

  playerIds.forEach(uid => {
    const userRef = doc(db, "users", uid);
    batch.update(userRef, {
      status: UserStatus.WAITING,
      currentQueueId: null
    });
  });

  await batch.commit();
}

export const switchBranch = async (userId, newBranch) => {
  try {
    const userRef = doc(db, "users", userId)
    await updateDoc(userRef, {
      branchId: newBranch
    });
  } catch (e) {
    console.error("Error switching branch:", e);
    throw error;
  }
}

export const seedMockQueue = async (branchId, totalQueuesToCreate = 5) => {
  try {
    console.log(`Starting seed for ${totalQueuesToCreate} queue items...`);

    for (let i = 0; i < totalQueuesToCreate; i++) {
      // REQUIREMENT: First 3 are always SYNC (6 people total). The rest are random.
      let type = QueueType.SOLO;
      if (i < 3) {
        type = QueueType.SYNC;
      } else {
        // 70% chance of Sync, 30% chance of Solo for remaining items
        type = Math.random() > 0.3 ? QueueType.SYNC : QueueType.SOLO;
      }

      // REQUIREMENT: Random Guest appearance
      // 30% chance the second player in a Sync game is a Guest
      const useGuestForP2 = Math.random() < 0.3;

      // 1. Create Mock Users
      const players = [];
      const playerNames = [];

      // Helper to generate a mock user doc
      const createMockUser = async (isGuest, suffix) => {
        const userRef = doc(collection(db, "users"));
        const name = isGuest ? `Guest_${suffix}` : `MockUser_${suffix}`;
        
        await setDoc(userRef, {
          uid: userRef.id,
          username: name,
          isGuest: isGuest,
          status: UserStatus.IN_QUEUE, // They start directly in queue
          branchId: branchId,
          currentQueueId: null, // Will update momentarily
          createdAt: serverTimestamp(),
          isMock: true // Tag for easier cleanup later
        });
        
        return { id: userRef.id, name: name };
      };

      // Create Player 1 (Always a regular user for this test)
      const p1 = await createMockUser(false, `${i}A_${Math.floor(Math.random() * 1000)}`);
      players.push(p1.id);
      playerNames.push(p1.name);

      // Create Player 2 (Only if Sync)
      if (type === QueueType.SYNC) {
        const p2 = await createMockUser(useGuestForP2, `${i}B_${Math.floor(Math.random() * 1000)}`);
        players.push(p2.id);
        playerNames.push(p2.name);
      }

      // 2. Create the Queue Item
      const queueRef = doc(collection(db, "queue"));
      await setDoc(queueRef, {
        sessionId: queueRef.id,
        branchId: branchId,
        type: type,
        status: QueueStatus.QUEUED,
        players: players,
        playerNames: playerNames,
        playerCount: players.length,
        createdAt: serverTimestamp(),
        startedAt: null,
        endedAt: null,
        isMock: true
      });

      // 3. Link Users to Queue
      for (const uid of players) {
        await updateDoc(doc(db, "users", uid), {
          currentQueueId: queueRef.id
        });
      }
    }
    
    console.log("Mock queue seeding complete!");
    alert(`Successfully added ${totalQueuesToCreate} mock groups to the queue.`);

  } catch (e) {
    console.error("Error seeding mock data:", e);
    alert("Failed to seed data. Check console.");
  }
};

export const seedWaitingList = async (branchId) => {
    const BATCH_SIZE = 10;
    const batch = writeBatch(db);
    
    // 1. Define the specific archetypes you asked for
    const archetypes = [
        { name: "Pro_Casual_Mock", rank: 15000, style: "Casual" },          // High Rank, Chill Style
        { name: "Spammer_Mid_Mock", rank: 12000, style: "14k Spammer" },     // Your specific example
        { name: "Newbie_Dave_Mock", rank: 100, style: "Casual" },            // Total beginner
        { name: "Grinder_X_Mock", rank: 8500, style: "Chiho Grinder" },      // Mid-tier grinder
        { name: "Lone_Wolf_Mock", rank: 14500, style: "Lone Wolf" }          // High rank, anti-social
    ];

    const styles = ["Casual", "Chiho Grinder", "14k Spammer", "Solo Boring", "Lone Wolf"];

    try {
        console.log("Seeding waiting list...");

        // 2. Add the specific archetypes first
        archetypes.forEach((arch) => {
            const userRef = doc(collection(db, "users"));
            batch.set(userRef, {
                uid: userRef.id,
                username: arch.name,
                rank: arch.rank,
                playStyle: arch.style,
                status: UserStatus.WAITING, // Crucial for Find Partner
                branchId: branchId,
                isMock: true,               // For cleanup
                createdAt: serverTimestamp()
            });
        });

        // 3. Fill the rest with Random Data to reach BATCH_SIZE
        const remaining = BATCH_SIZE - archetypes.length;
        
        for (let i = 0; i < remaining; i++) {
            const userRef = doc(collection(db, "users"));
            
            // Random Rank between 500 and 14000
            const randomRank = Math.floor(Math.random() * 13500) + 500;
            // Random Style
            const randomStyle = styles[Math.floor(Math.random() * styles.length)];

            batch.set(userRef, {
                uid: userRef.id,
                username: `Random_User_${i+1}`,
                rank: randomRank,
                playStyle: randomStyle,
                status: UserStatus.WAITING,
                branchId: branchId,
                isMock: true,
                createdAt: serverTimestamp()
            });
        }

        await batch.commit();
        console.log("Waiting list seeded successfully!");
        alert(`Added ${BATCH_SIZE} mock users to the ${branchId} waiting list.`);

    } catch (e) {
        console.error("Error seeding waiting list:", e);
        alert("Failed to seed waiting list.");
    }
};