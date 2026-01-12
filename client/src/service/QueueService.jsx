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
    let isMachineFree = true

    const qActive = query(
      collection(db, "queue"), // or "queue_sessions" depending on your collection name
      where("branchId", "==", branchId),
      where("status", "==", QueueStatus.PLAYING),
    );
    const activeSnap = await getDocs(qActive);
    const busyCabsCount = activeSnap.size;
    
    if (busyCabsCount < cabCount) {
        isMachineFree = true;
    }

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
        transaction.update(sessionRefToJoin, {
          players: arrayUnion(userId),
          playerNames: arrayUnion(myUsername),
          playerCount: increment(1),
          ...(isMachineFree && { 
              status: QueueStatus.PLAYING, 
              startedAt: serverTimestamp() 
          })
        });

        transaction.update(userRef, {
          status: isMachineFree ? UserStatus.PLAYING : UserStatus.IN_QUEUE,
          currentQueueId: sessionRefToJoin.id
        });

        console.log(`Joined existing Sync session: ${sessionRefToJoin.id}`);
      } else {
        const newSessionRef = doc(collection(db, "queue"));

        const shouldStartNow = isMachineFree && mode === QueueType.SOLO;

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

export const startGame = async (queueId) => {
  const sessionRef = doc(db, "queue", queueId);

  await updateDoc(sessionRef, {
    status: QueueStatus.PLAYING,
    startedAt: serverTimestamp()
  });
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
      status: UserStatus.WAITING, // or UserStatus.ONLINE
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