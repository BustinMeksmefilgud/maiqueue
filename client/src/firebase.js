// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDyz60q3CsyDL1GzhmGUN7VmVW4e-4O-_I",
  authDomain: "maiqueue-1877c.firebaseapp.com",
  projectId: "maiqueue-1877c",
  storageBucket: "maiqueue-1877c.firebasestorage.app",
  messagingSenderId: "166413560880",
  appId: "1:166413560880:web:1dc21ef71d68bc250911f5"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { db, auth, googleProvider };