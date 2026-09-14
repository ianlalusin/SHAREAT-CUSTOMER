import { getAuth, type User } from "firebase/auth";

/**
 * The persisted Firebase user, once the SDK has actually restored it.
 *
 * `getAuth().currentUser` read straight after mount is null on every hard
 * refresh, because persistence rehydrates asynchronously. Screens that read it
 * synchronously sent a signed-in diner back to the PIN screen (dashboard) or
 * rendered an empty menu / order list (catalog, session orders). Awaiting this
 * first gives the same answer a moment later, but the right one.
 */
export async function waitForAuthUser(): Promise<User | null> {
  const auth = getAuth();
  if (auth.currentUser) return auth.currentUser;
  await auth.authStateReady();
  return auth.currentUser;
}
