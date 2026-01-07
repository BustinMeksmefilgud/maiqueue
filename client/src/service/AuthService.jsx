import { auth, db } from "../firebase"; // <--- Import db
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export const registerUser = async (userInfo) => {
    try {
        // 1. Create the Authentication Account
        const userCredential = await createUserWithEmailAndPassword(auth, userInfo.email, userInfo.password);
        const user = userCredential.user;

        // 2. Create the User Profile in Firestore
        // We use setDoc with the user.uid so the IDs match perfectly!
      await setDoc(doc(db, "users", user.uid), {
            userId: user.uid,
            email: userInfo.email,
            username: userInfo.username,
            rank: Number(userInfo.rank),     
            playStyle: userInfo.playStyle,
            createdAt: new Date()
        });

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

// --- LOGOUT ---
export const logoutUser = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout Error:", error);
  }
};