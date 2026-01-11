import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser, loginUser, loginAsGuest } from "../service/AuthService.jsx";

export default function Auth() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [username, setUsername] = useState("");
  const [rank, setRank] = useState(100);
  const [playStyle, setPlayStyle] = useState("Casual");

  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [guestName, setGuestName] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault(); // Stop refresh here in the UI
    setError("");
    setLoading(true);

    try {
      if (isRegistering) {
        // --- PASS DATA AS AN OBJECT ---
        const userData = {
          email: email,
          password: password,
          username: username,
          rank: rank,
          playStyle: playStyle
        };

        const success = await registerUser(userData);
        if (success) {

        }
      } else {
        await loginUser(email, password);
      }

      // Success! (React Router will auto-redirect because of your App.jsx listener)
      navigate("/");
    } catch (err) {
      let msg = err.message;
      if (msg.includes("auth/invalid-email")) msg = "Invalid email address.";
      if (msg.includes("auth/invalid-credential")) msg = "Wrong email or password.";
      if (msg.includes("auth/email-already-in-use")) msg = "Email already registered.";
      if (msg.includes("auth/weak-password")) msg = "Password must be 6+ characters.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestSubmit = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setError("Please enter a guest name.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await loginAsGuest(guestName);
      navigate("/"); // Redirect on success
    } catch (err) {
      setError("Failed to join as guest: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center justify-center">

      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        {/* Card Container */}
        <div className="card w-full max-w-md shadow-2xl bg-teal-900" height="500px">
          <div className="card-body">
            <h2 className="card-title text-2xl font-bold justify-center mb-4">
              {isRegistering ? "Create Account" : "Welcome Back"}
            </h2>

            {/* Error Alert */}
            {error && (
              <div role="alert" className="alert alert-error text-sm py-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="form-control text-emerald-950 gap-4">

              {/* Email Field */}
              <div>
                <label className="label"><span className="label-text text-zinc-50 mb-2">Email</span></label>
                <input
                  type="email"
                  placeholder="email@example.com"
                  className="input input-primary input-bordered  w-full p-3"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              {/* Password Field */}
              <div>
                <label className="label"><span className="label-text text-zinc-50 mb-2">Password</span></label>
                <input
                  type="password"
                  placeholder="******"
                  className="input input-bordered w-full p-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {/* --- EXTRA FIELDS (Only shown during Register) --- */}
              {isRegistering && (
                <div className="space-y-4">
                  <div className="divider text-xs text-zinc-200">PROFILE DETAILS</div>

                  {/* Username */}
                  <div>
                    <label className="label"><span className="label-text text-zinc-50 mb-2">Display Name</span></label>
                    <input
                      type="text"
                      placeholder="e.g. MaimaiGod123"
                      className="input input-bordered w-full p-3"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {/* Rank Selector */}
                    <div>
                      <label className="label"><span className="label-text text-zinc-50 mb-2">Rank</span></label>
                      <input
                        type="number"
                        className="input input-bordered w-full p-3"
                        value={rank}
                        onChange={(e) => setRank(e.target.value)}
                        min="100" max="15000"
                      />
                    </div>
                    <div>
                      <label className="label"><span className="label-text text-zinc-50 mb-2">Playstyle</span></label>
                      <select
                        className="select select-bordered w-full p-3"
                        value={playStyle}
                        onChange={(e) => setPlayStyle(e.target.value)}
                      >
                        <option value="Casual">Casual</option>
                        <option value="Chiho Grinder">Chiho Grinder</option>
                        <option value="14k Spammer">14k Spammer</option>
                        <option value="Syncer">Lone Wolf</option>
                        <option value="Syncer">Solo Boring</option>
                      </select>
                    </div>
                  </div>



                </div>
              )}

              {/* Submit Button */}
              <div className="form-control mt-6">
                <button
                  className={`btn btn-primary text-zinc-200 ${loading ? 'loading' : ''}`}
                  disabled={loading}
                >
                  {loading ? "Processing..." : (isRegistering ? "Sign Up" : "Log In")}
                </button>
              </div>
            </form>
            {!isRegistering && (
              <div>
                <div className="divider text-teal-500/50 text-xs mt-6">OR PLAY AS GUEST</div>

                {/* --- GUEST FORM --- */}

                <form onSubmit={handleGuestSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Guest Name..."
                    className="input input-bordered input-sm flex-grow bg-teal-950 text-white border-teal-700 p-3"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    maxLength={12}
                  />
                  <button
                    className="btn btn-sm btn-outline btn-accent"
                    disabled={loading || !guestName.trim()}
                  >
                    Join
                  </button>
                </form>
              </div>
            )}

          </div>
        </div>
        {/* Toggle Link */}
        <div className="text-center mt-4">
          <p className="text-sm">
            {isRegistering ? "Already have an account?" : "New to MaiQueue?"}{" "}
            <button
              className="link link-primary no-underline font-bold"
              onClick={() => { setIsRegistering(!isRegistering); setError("") }}
            >
              {isRegistering ? "Log In" : "Create Account"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}