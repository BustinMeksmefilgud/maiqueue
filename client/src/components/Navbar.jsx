import { useLocation, useNavigate, Link } from "react-router-dom";
import { logoutUser } from "../service/AuthService";

export default function Navbar({ user, loading }) {
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Hide Navbar if we are on the Login page
  if (location.pathname === "/login") {
    return null;
  }

  const handleLogout = async () => {
    await logoutUser(user?.uid);
    navigate("/login");
  };

  const handleLogin = async () => {
    navigate("/login");
  };

  return (
    // DaisyUI Navbar component with a transparent background
    <div className="navbar bg-black/20 text-zinc-100 backdrop-blur-sm sticky top-0 z-50">

      {/* Left Side: Logo/Brand */}
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost text-xl font-bold text-teal-100">
          MaiQueue
        </Link>
      </div>
      <div className="flex-none gap-2">

        {/* CASE 1: LOADING (Show Skeleton) */}
        {loading ? (
          <div className="flex items-center gap-3 animate-pulse">
            {/* Fake Name Bar */}
            <div className="h-4 w-24 bg-teal-800/50 rounded"></div>
            {/* Fake Button Circle */}
            <div className="h-8 w-16 bg-teal-800/50 rounded-lg"></div>
          </div>
        ) : (
          /* CASE 2: LOADED (Show Real Data) */
          <>
            {user ? (
              <>
                <span className="hidden sm:inline text-sm text-teal-200 mr-2 font-medium">
                  {user.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="btn btn-sm btn-error btn-outline bg-black text-white hover:bg-red-500/20"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-sm  text-teal-200 mr-2">
                  Guest
                </span>
                <button
                  onClick={handleLogin}
                  className="btn btn-sm btn-error btn-outline bg-black text-white hover:bg-red-500/20"
                >
                  Log in
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}