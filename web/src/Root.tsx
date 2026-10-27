import { useEffect, useState } from "react";
import { App } from "./App";
import { currentUser, SIGNED_OUT, signOut } from "./session";
import { SignIn } from "./SignIn";

/** Shows the sign-in screen until there's a valid demo session, then the console. */
export function Root() {
  const [user, setUser] = useState<string | null | undefined>(undefined);
  // True when the visitor just signed in on this page, so the console opens with the guide.
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    currentUser().then(setUser).catch(() => setUser(null));
    const onSignedOut = () => {
      setUser(null);
      setFresh(false);
    };
    window.addEventListener(SIGNED_OUT, onSignedOut);
    return () => window.removeEventListener(SIGNED_OUT, onSignedOut);
  }, []);

  if (user === undefined) return null; // checking the stored session
  if (!user)
    return (
      <SignIn
        onSignedIn={(email) => {
          setFresh(true);
          setUser(email);
        }}
      />
    );
  return <App user={user} onSignOut={signOut} freshSignIn={fresh} />;
}
