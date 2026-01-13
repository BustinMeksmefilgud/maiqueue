import './App.css';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { onSnapshot, doc, getDoc } from "firebase/firestore";
import { auth, db } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { User } from "./model/User";

// Import Pages
import Queue from './pages/Queue';
import Auth from './pages/Auth';
import Admin from './pages/Admin';
import Pear from './pages/Pear';

// Components
import Navbar from './components/Navbar';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const guestUser = {
    username: "Guest"
  }
  // Global Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      
      if (currentUser) {
        try {
          const userRef = doc(db, "users", currentUser.uid);
         const unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            // Every time the DB changes (e.g. Branch switch), this runs!
            // We create a fresh User object with the NEW data.
            console.log(docSnap.data())
            const userEntity = new User({ uid: currentUser.uid, ...docSnap.data() });
            
            console.log("Profile updated!", userEntity); // Debugging
            setUser(userEntity);
          }
        });
        } catch (e) {
          console.error("Error fetching user profile:", error);
          setUser(guestUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    
      <div className="h-screen w-screen bg-blue-900 flex justify-center overflow-hidden">
        <Router>
          <div className="w-full max-w-md h-full bg-gradient-to-tr lg:bg-gradient-to-tl from-teal-900 via-teal-700 to-emerald-700 shadow-2xl flex flex-col relative">
          <Navbar user={user} loading={loading} />
            <div className="flex-1 overflow-y-auto">
              <Routes>
                {/* Route 1: The Main Page (Pass user prop so it knows to show "Join") */}
              <Route path="/" element={<Queue user={user} />} />
              
              <Route path="/queue" element={<Queue user={user} />} />
                
                {/* Route 2: The Login Page (Pass user prop so it can redirect) */}
              <Route path="/login" element={<Auth user={user} />} />
              <Route path="/admin" element={<Admin user={user} />} />
              <Route path="/teto" element={<Pear />} />
              </Routes>
            </div>
          </div>
        </Router>
      </div>
     
 
  );
}

export default App;