import { useEffect, useState } from "react";
import { App } from "./App";
import { currentUser, SIGNED_OUT, signOut } from "./session";
import { SignIn } from "./SignIn";

/** Shows the sign-in screen until there's a valid demo session, then the console. */
export function Root() {
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    currentUser().then(setUser).catch(() => setUser(null));
    const onSignedOut = () => setUser(null);
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, []);

  if (user === undefined) return null; // checking the stored session
  if (!user) return <SignIn onSignedIn={setUser} />;
  return <App user={user} onSignOut={signOut} />;
}
