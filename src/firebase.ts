import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCredential,
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  addDoc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId); /* CRITICAL: The app will break without this line */
export const auth = getAuth(app);

// Guarantee browser-level local persistence so session never expires across page reloads
setPersistence(auth, browserLocalPersistence).catch(() => {});

export const googleProvider = new GoogleAuthProvider();

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'normal' | 'premium' | 'admin';
  createdAt: string;
  lastLoginAt: string;
  generationCount: number;
  dailyGenerations: number;
  lastGenerationDate: string;
  premiumExpiresAt?: string; // 1 Month (30 Days) expiration date
  forceLogout?: boolean;
  isDemo?: boolean;
}

export interface UpgradeRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  plan: string;
  paymentSlipBase64?: string;
}

export interface GenerationRecord {
  id?: string;
  userId: string;
  userEmail: string;
  text: string;
  voice: string;
  createdAt: string;
}

export const BOOTSTRAP_ADMIN_EMAIL = "nwe98698@gmail.com";

// Silent connection test helper without throwing uncaught timeouts
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    // Silently ignore offline / pending connection notices
  }
}

// Concurrency guard to prevent 'INTERNAL ASSERTION FAILED: Pending promise was never set'
let isLoginInProgress = false;

// Login with Google Popup with fallback error handling
export async function loginWithGoogle(): Promise<{ user: UserProfile | null; error?: string; isApiPending?: boolean }> {
  if (isLoginInProgress) {
    return { user: null, error: "Sign-in operation is already in progress. Please wait." };
  }

  isLoginInProgress = true;
  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    const profile = await syncUserProfile(user);
    return { user: profile };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.warn("Google Sign-In Notice:", errorMsg);

    const isApiPending = errorMsg.includes("identity-toolkit-api-has-not-been-used") || 
                         errorMsg.includes("auth/identity-toolkit-api") ||
                         errorMsg.includes("api-has-not-been-used");

    return { 
      user: null, 
      error: isApiPending 
        ? "Google Cloud Identity Toolkit API ကို Google Console တွင် အနိမ့်ဆုံး စက္ကန့်အနည်းငယ် အသက်သွင်းနေဆဲ ဖြစ်ပါသည်။" 
        : errorMsg,
      isApiPending
    };
  } finally {
    isLoginInProgress = false;
  }
}

// Direct Google Account Email Login (for bypass when popups/third-party cookies are blocked in preview iframe)
export async function loginWithGoogleEmail(emailInput: string, nameInput?: string): Promise<UserProfile> {
  const cleanEmail = emailInput.trim().toLowerCase();
  const isBootstrapAdmin = cleanEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  
  const uid = 'usr_' + btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
  const userRef = doc(db, 'users', uid);
  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  let userProfile: UserProfile;

  try {
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      userProfile = {
        uid,
        email: cleanEmail,
        displayName: nameInput || cleanEmail.split('@')[0],
        photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanEmail}`,
        role: isBootstrapAdmin ? 'admin' : 'normal',
        createdAt: nowIso,
        lastLoginAt: nowIso,
        generationCount: 0,
        dailyGenerations: 0,
        lastGenerationDate: todayStr,
      };
      await setDoc(userRef, userProfile);
    } else {
      const existing = userSnap.data() as UserProfile;
      const finalRole = isBootstrapAdmin ? 'admin' : existing.role;
      let dailyGenerations = existing.dailyGenerations || 0;
      if (existing.lastGenerationDate !== todayStr) {
        dailyGenerations = 0;
      }

      userProfile = {
        ...existing,
        email: cleanEmail,
        role: finalRole,
        lastLoginAt: nowIso,
        dailyGenerations,
        lastGenerationDate: todayStr,
      };

      await updateDoc(userRef, {
        role: finalRole,
        lastLoginAt: nowIso,
        dailyGenerations,
        lastGenerationDate: todayStr,
      });
    }
  } catch (e) {
    userProfile = {
      uid,
      email: cleanEmail,
      displayName: nameInput || cleanEmail.split('@')[0],
      photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${cleanEmail}`,
      role: isBootstrapAdmin ? 'admin' : 'normal',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      generationCount: 0,
      dailyGenerations: 0,
      lastGenerationDate: todayStr,
      isDemo: true
    };
  }

  return userProfile;
}

// Get Quick Demo Profile
export function getDemoUserProfile(role: 'admin' | 'premium' | 'normal'): UserProfile {
  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  if (role === 'admin') {
    return {
      uid: "demo_admin_uid_99",
      email: BOOTSTRAP_ADMIN_EMAIL,
      displayName: "လင်းလင်းဇော် (Admin)",
      photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      role: 'admin',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      generationCount: 42,
      dailyGenerations: 3,
      lastGenerationDate: todayStr,
      isDemo: true
    };
  } else if (role === 'premium') {
    return {
      uid: "demo_premium_uid_88",
      email: "premium_vip@linzaw.com",
      displayName: "VIP Member",
      photoURL: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
      role: 'premium',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      generationCount: 18,
      dailyGenerations: 2,
      lastGenerationDate: todayStr,
      isDemo: true
    };
  } else {
    return {
      uid: "demo_normal_uid_77",
      email: "normal_user@linzaw.com",
      displayName: "Normal User",
      photoURL: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
      role: 'normal',
      createdAt: nowIso,
      lastLoginAt: nowIso,
      generationCount: 5,
      dailyGenerations: 3,
      lastGenerationDate: todayStr,
      isDemo: true
    };
  }
}

// Logout
export async function logoutUser() {
  try {
    await signOut(auth);
  } catch (e) {
    console.warn("Logout notice:", e);
  }
}

// Sync user profile to Firestore
export async function syncUserProfile(firebaseUser: FirebaseUser): Promise<UserProfile> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  let userSnap;
  try {
    userSnap = await getDoc(userRef);
  } catch (e) {
    console.warn("Firestore user fetch notice:", e);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  const isBootstrapAdmin = firebaseUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

  // Always check server backend (/api/users/me) for latest assigned role/permission
  let serverRole: 'admin' | 'premium' | 'normal' | null = null;
  let serverExpiresAt: string | undefined = undefined;

  if (firebaseUser.email) {
    try {
      const sRes = await fetch(`/api/users/me?email=${encodeURIComponent(firebaseUser.email.toLowerCase())}&uid=${firebaseUser.uid}`);
      if (sRes.ok) {
        const sData = await sRes.json();
        if (sData && sData.role) {
          serverRole = isBootstrapAdmin ? 'admin' : sData.role;
          serverExpiresAt = sData.premiumExpiresAt;
        }
      }
    } catch (e) {}
  }

  let userProfile: UserProfile;

  if (!userSnap || !userSnap.exists()) {
    let initialRole: 'admin' | 'premium' | 'normal' = isBootstrapAdmin
      ? 'admin'
      : (serverRole || 'normal');
    let initialExpiresAt: string | undefined = serverExpiresAt;

    userProfile = {
      uid: firebaseUser.uid,
      email: firebaseUser.email || '',
      displayName: firebaseUser.displayName || 'User',
      photoURL: firebaseUser.photoURL || '',
      role: initialRole,
      premiumExpiresAt: initialExpiresAt,
      createdAt: nowIso,
      lastLoginAt: nowIso,
      generationCount: 0,
      dailyGenerations: 0,
      lastGenerationDate: todayStr,
    };
    try {
      await setDoc(userRef, userProfile);
    } catch (e) {
      console.warn("SetDoc user profile notice:", e);
    }
  } else {
    const existing = userSnap.data() as UserProfile;

    // Prefer premium/admin if assigned on server or in Firestore
    let finalRole: 'admin' | 'premium' | 'normal' = isBootstrapAdmin
      ? 'admin'
      : (serverRole === 'premium' || serverRole === 'admin')
      ? serverRole
      : (existing.role === 'premium' || existing.role === 'admin')
      ? existing.role
      : (serverRole || existing.role || 'normal');

    let premiumExpiresAt = serverExpiresAt || existing.premiumExpiresAt;

    // Check 1 Month Premium validity
    if (finalRole === 'premium') {
      if (premiumExpiresAt && new Date(premiumExpiresAt).getTime() < Date.now()) {
        finalRole = 'normal';
        premiumExpiresAt = undefined;
      } else if (!premiumExpiresAt) {
        // If approved without explicit date, default to 1 Month from today
        premiumExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    let dailyGenerations = existing.dailyGenerations || 0;
    if (existing.lastGenerationDate !== todayStr) {
      dailyGenerations = 0;
    }

    userProfile = {
      ...existing,
      email: firebaseUser.email || existing.email,
      displayName: firebaseUser.displayName || existing.displayName,
      photoURL: firebaseUser.photoURL || existing.photoURL,
      role: finalRole,
      premiumExpiresAt,
      lastLoginAt: nowIso,
      dailyGenerations,
      lastGenerationDate: todayStr,
    };

    try {
      await updateDoc(userRef, {
        role: finalRole,
        premiumExpiresAt: premiumExpiresAt || null,
        lastLoginAt: nowIso,
        dailyGenerations,
        lastGenerationDate: todayStr,
      });
    } catch (e) {
      console.warn("UpdateDoc user profile notice:", e);
    }
  }

  return userProfile;
}

// Update User Role (Admin function with 1 Month duration for Premium)
export async function updateUserRole(
  targetUid: string, 
  newRole: 'normal' | 'premium' | 'admin', 
  userEmail?: string,
  customExpiresAt?: string
) {
  const cleanEmail = userEmail ? userEmail.trim().toLowerCase() : '';
  const isBootstrapAdmin = cleanEmail === BOOTSTRAP_ADMIN_EMAIL.toLowerCase();
  const finalRole = isBootstrapAdmin ? 'admin' : newRole;
  
  const oneMonthLater = customExpiresAt || (finalRole === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null);

  const payload: any = {
    role: finalRole,
    premiumExpiresAt: oneMonthLater,
    forceLogout: false,
    ...(cleanEmail ? { email: cleanEmail } : {})
  };

  try {
    const targetRef = doc(db, 'users', targetUid);
    await setDoc(targetRef, payload, { merge: true });
  } catch (e) {
    console.warn("Firestore updateUserRole notice:", e);
  }

  if (cleanEmail) {
    try {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      snap.forEach(async (d) => {
        await setDoc(d.ref, payload, { merge: true });
      });
    } catch (e) {
      console.warn("Firestore email query updateUserRole notice:", e);
    }
  }

  try {
    await fetch("/api/users/role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        userId: targetUid, 
        userEmail: cleanEmail, 
        newRole: finalRole,
        premiumExpiresAt: oneMonthLater 
      })
    });
  } catch (e) {
    console.warn("API updateUserRole notice:", e);
  }
}

// Force Logout & Delete User Account from Database (Admin function)
export async function forceLogoutUser(targetUid: string, userEmail: string, deletePermanently: boolean = true) {
  const cleanEmail = (userEmail || '').trim().toLowerCase();
  const payload: any = {
    forceLogout: true,
    role: 'normal',
    premiumExpiresAt: null,
  };

  // 1. Mark forceLogout so active client signs out immediately
  try {
    if (targetUid) {
      await setDoc(doc(db, 'users', targetUid), payload, { merge: true });
    }
    if (cleanEmail) {
      const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await setDoc(d.ref, payload, { merge: true });
      }
    }
  } catch (e) {
    console.warn("Firestore forceLogout notice:", e);
  }

  // 2. If deletePermanently, delete from Firestore users & upgrade_requests
  if (deletePermanently) {
    try {
      if (targetUid) {
        await deleteDoc(doc(db, 'users', targetUid));
      }
      if (cleanEmail) {
        const qUsers = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const snapUsers = await getDocs(qUsers);
        for (const d of snapUsers.docs) {
          await deleteDoc(d.ref);
        }

        const qReqs = query(collection(db, 'upgrade_requests'), where('userEmail', '==', cleanEmail));
        const snapReqs = await getDocs(qReqs);
        for (const d of snapReqs.docs) {
          await deleteDoc(d.ref);
        }
      }
    } catch (e) {
      console.warn("Firestore deleteUser notice:", e);
    }
  }

  // 3. Call backend APIs
  try {
    await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUid, userEmail: cleanEmail })
    });
  } catch (e) {
    console.warn("API delete user notice:", e);
  }
}

// Permanently delete user account
export async function deleteUserAccount(targetUid: string, userEmail: string) {
  return forceLogoutUser(targetUid, userEmail, true);
}

// Request Upgrade to Premium
export async function createUpgradeRequest(user: UserProfile, paymentSlipBase64?: string) {
  const payload = {
    userId: user.uid,
    userEmail: user.email,
    userName: user.displayName,
    status: 'pending' as const,
    createdAt: new Date().toISOString(),
    plan: 'Premium Member (30,000 Chars)',
    paymentSlipBase64: paymentSlipBase64 || ''
  };

  let firestoreSuccess = false;
  try {
    const reqRef = collection(db, 'upgrade_requests');
    await addDoc(reqRef, payload);
    firestoreSuccess = true;
  } catch (e) {
    console.warn("Firestore upgrade request notice:", e);
  }

  try {
    await fetch("/api/upgrade-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn("API upgrade request notice:", e);
    if (!firestoreSuccess) {
      throw e;
    }
  }

  try {
    await fetch("/api/users/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(user)
    });
  } catch (e) {
    // Non-fatal
  }
}

// Record TTS Generation
export async function recordGeneration(user: UserProfile | null, textSnippet: string, voiceName: string) {
  try {
    if (user?.isDemo) return;
    const genRef = collection(db, 'generations');
    const isGuest = !user;

    await addDoc(genRef, {
      userId: isGuest ? 'guest_anonymous' : user.uid,
      userEmail: isGuest ? 'Guest User (Login မဝင်ထားသူ)' : user.email,
      userName: isGuest ? 'Guest User' : user.displayName,
      text: textSnippet,
      voice: voiceName,
      createdAt: new Date().toISOString()
    });

    if (user) {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        generationCount: (user.generationCount || 0) + 1,
        dailyGenerations: (user.dailyGenerations || 0) + 1,
        lastGenerationDate: new Date().toISOString().split('T')[0]
      });
    }
  } catch (e) {
    console.warn("Generation recording notice:", e);
  }
}
