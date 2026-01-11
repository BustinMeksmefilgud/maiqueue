import { auth, db } from "../firebase"; // <--- Import db
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut
} from "firebase/auth";
import { doc, setDoc, getDoc, runTransaction, collection, query, where, getDocs, writeBatch } from "firebase/firestore";
import { User } from "../model/User";
import { BranchCode, UserStatus } from "../model/Enums";
import { leaveQueue } from "./QueueService";

export const registerUser = async (userInfo) => {
  try {
    // 1. Create the Authentication Account
    const userCredential = await createUserWithEmailAndPassword(auth, userInfo.email, userInfo.password);
    const user = userCredential.user;
    const newUser = new User({
      uid: user.uid,
      email: userInfo.email,
      username: userInfo.username,
      rank: Number(userInfo.rank),
      playStyle: userInfo.playStyle,
    })
    await setDoc(doc(db, "users", user.uid), newUser.toFirestore());

    console.log("User created and profile saved!");
    return user;
  } catch (err) {
    throw err;
  }
};

// --- LOGIN ---
export const loginUser = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
};

export const loginAsGuest = async (guestName) => {
  try {
    const userCredential = await signInAnonymously(auth);
    const { uid } = userCredential.user;

    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // User exists! Just update their name if they changed it
      // but KEEP their queue spot / status.
      return uid;
    }

    const newGuest = new User({
      uid: uid,
      username: guestName,
      isGuest: true,
    });

    await setDoc(userRef, newGuest.toFirestore());
    return uid;

  } catch (e) {
    console.error("Guest login failed:", e);
    throw e;
  }
}

// --- LOGOUT ---
export const logoutUser = async (userId) => {
  if (!userId) return;
  try {
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();

      // A. If in Active Queue -> Use the complex leaveQueue (handles guests)
      if (userData.status === UserStatus.IN_QUEUE && userData.currentQueueId) {
        console.log("User is in queue. performing cascading exit...");
        await leaveQueue(userId, userData.currentQueueId);
      }

      const guestQuery = query(
        collection(db, "users"),
        where("addedBy", "==", userId),
        where("isGuest", "==", true)
      );

      const guestSnaps = await getDocs(guestQuery);
      if (!guestSnaps.empty) {
        const batch = writeBatch(db);
        guestSnaps.forEach(guestDoc => {
          // Delete guest entirely OR set to offline?
          // Usually deleting temp guests is cleaner.
          batch.delete(guestDoc.ref);
        });
        await batch.commit();
      }

      // Force status to OFFLINE
      await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {
          status: UserStatus.OFFLINE,
          currentQueueId: null,
        });
      });
    }
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
    await signOut(auth);
  }
};

export const seedDatabaseBranches = async () => {
  // 1. Define the data for SM Seaside
  const seasideData = {
    branchCode: BranchCode.SISA,
    branchName: "SM Seaside City",
    cabinetCount: 1, // Seaside has 1 cab
    status: "OPEN",
  };

  // 2. Define the data for SM Jmall
  const jmallData = {
    branchCode: BranchCode.JAMAL,
    branchName: "SM Jmall",
    cabinetCount: 2, // Jmall has 2 cabs
    status: "OPEN",
  };

  try {
    // 3. Save them to the 'branches' collection
    // We use setDoc with a specific ID so we can find them easily later
    await setDoc(doc(db, "branches", BranchCode.SISA), seasideData);
    await setDoc(doc(db, "branches", BranchCode.JAMAL), jmallData);

    alert("Branches created successfully!");
  } catch (error) {
    console.error("Error seeding branches:", error);
    alert("Error: " + error.message);
  }
};