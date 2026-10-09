import React, { useState, useEffect } from 'react';
import { 
  UserProfile, 
  UpgradeRequest, 
  GenerationRecord, 
  updateUserRole, 
  forceLogoutUser,
  createUpgradeRequest, 
  db 
} from '../firebase';
import { GoogleSignInButton } from './GoogleSignInButton';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  query, 
  orderBy, 
  limit, 
  where 
} from 'firebase/firestore';
import { 
  Shield, 
  Crown, 
  User, 
  LogOut, 
  Sparkles, 
  CheckCircle2, 
  XCircle, 
  Users, 
  Clock, 
  BarChart3, 
  X, 
  ChevronRight, 
  AlertCircle,
  Zap,
  ArrowUpRight,
  RefreshCw,
  Check,
  Search
} from 'lucide-react';

interface UserDashboardProps {
  userProfile: UserProfile | null;
  onLogin: () => void;
  onGoogleSuccess?: (profile: UserProfile) => void;
  onEmailLogin?: (email: string) => void;
  onSelectDemoRole?: (role: 'admin' | 'premium' | 'normal') => void;
  onLogout: () => void;
  onClose: () => void;
  authNotice?: string | null;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  userProfile,
  onLogin,
  onGoogleSuccess,
  onEmailLogin,
  onSelectDemoRole,
  onLogout,
  onClose,
  authNotice
}) => {
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<UpgradeRequest[]>([]);
  const [generations, setGenerations] = useState<GenerationRecord[]>([]);
  const [adminTab, setAdminTab] = useState<'users' | 'requests' | 'generations'>('users');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'normal' | 'premium' | 'admin' | 'guest'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [myRequests, setMyRequests] = useState<UpgradeRequest[]>([]);
  const [isSubmittingUpgrade, setIsSubmittingUpgrade] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedSlipPreview, setSelectedSlipPreview] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');
  const [forceLogoutConfirmUser, setForceLogoutConfirmUser] = useState<UserProfile | null>(null);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  // Helper to load server upgrade requests & users
  const fetchServerData = async () => {
    try {
      const [reqsRes, usersRes] = await Promise.all([
        fetch("/api/upgrade-requests"),
        fetch("/api/users")
      ]);

      if (reqsRes.ok) {
        const apiReqs: UpgradeRequest[] = await reqsRes.json();
        if (Array.isArray(apiReqs) && apiReqs.length > 0) {
          setUpgradeRequests((prev) => {
            const map = new Map<string, UpgradeRequest>();
            apiReqs.forEach(r => map.set(r.id || r.userId, r));
            prev.forEach(r => map.set(r.id || r.userId, { ...(map.get(r.id || r.userId) || {}), ...r }));
            return Array.from(map.values()).sort((a, b) => 
              new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
          });
        }
      }

      if (usersRes.ok) {
        const apiUsers: UserProfile[] = await usersRes.json();
        if (Array.isArray(apiUsers) && apiUsers.length > 0) {
          setAllUsers((prev) => {
            const map = new Map<string, UserProfile>();
            apiUsers.forEach(u => map.set(u.uid || u.email, u));
            prev.forEach(u => map.set(u.uid || u.email, { ...(map.get(u.uid || u.email) || {}), ...u }));
            return Array.from(map.values());
          });
        }
      }
    } catch (e) {
      console.warn("Server data fetch notice:", e);
    }
  };

  // Subscribe to Firestore data
  useEffect(() => {
    if (!userProfile) return;

    // Listen to current user document
    const userUnsub = onSnapshot(doc(db, 'users', userProfile.uid), (docSnap) => {
      if (docSnap.exists()) {
        // Updated profile
      }
    });

    // Listen to user's own upgrade requests
    const myReqQuery = query(
      collection(db, 'upgrade_requests'),
      where('userId', '==', userProfile.uid)
    );
    const myReqUnsub = onSnapshot(myReqQuery, (snap) => {
      const list: UpgradeRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as UpgradeRequest));
      setMyRequests(list);
    });

    // If Admin, listen to all collections and sync with server
    let usersUnsub = () => {};
    let reqsUnsub = () => {};
    let genUnsub = () => {};

    const isUserAdmin = userProfile.role === 'admin' || userProfile.email?.toLowerCase() === 'nwe98698@gmail.com';

    if (isUserAdmin) {
      fetchServerData();

      try {
        usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
          const usersList: UserProfile[] = [];
          snap.forEach((d) => usersList.push(d.data() as UserProfile));
          if (usersList.length > 0) {
            setAllUsers((prev) => {
              const map = new Map<string, UserProfile>();
              prev.forEach(u => map.set(u.uid || u.email, u));
              usersList.forEach(u => map.set(u.uid || u.email, { ...(map.get(u.uid || u.email) || {}), ...u }));
              return Array.from(map.values());
            });
          }
        }, (err) => console.warn("Firestore users listener notice:", err));
      } catch (err) {
        console.warn("Firestore users unsub notice:", err);
      }

      try {
        reqsUnsub = onSnapshot(collection(db, 'upgrade_requests'), (snap) => {
          const reqList: UpgradeRequest[] = [];
          snap.forEach((d) => reqList.push({ id: d.id, ...d.data() } as UpgradeRequest));
          if (reqList.length > 0) {
            setUpgradeRequests((prev) => {
              const map = new Map<string, UpgradeRequest>();
              prev.forEach(r => map.set(r.id || r.userId, r));
              reqList.forEach(r => map.set(r.id || r.userId, { ...(map.get(r.id || r.userId) || {}), ...r }));
              return Array.from(map.values()).sort((a, b) => 
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
              );
            });
          }
        }, (err) => console.warn("Firestore upgrade_requests listener notice:", err));
      } catch (err) {
        console.warn("Firestore reqs unsub notice:", err);
      }

      try {
        const genQuery = query(collection(db, 'generations'), orderBy('createdAt', 'desc'), limit(50));
        genUnsub = onSnapshot(genQuery, (snap) => {
          const genList: GenerationRecord[] = [];
          snap.forEach((d) => genList.push({ id: d.id, ...d.data() } as GenerationRecord));
          setGenerations(genList);
        }, (err) => console.warn("Firestore generations listener notice:", err));
      } catch (err) {
        console.warn("Firestore gen unsub notice:", err);
      }
    }

    return () => {
      userUnsub();
      myReqUnsub();
      usersUnsub();
      reqsUnsub();
      genUnsub();
    };
  }, [userProfile]);

  const handleRequestUpgrade = async () => {
    if (!userProfile) return;
    setIsSubmittingUpgrade(true);
    try {
      await createUpgradeRequest(userProfile);
      setToastMessage("Premium အဆင့်မြှင့်တင်ရန် လျှောက်ထားချက် ပို့ပြီးပါပြီ။ Admin မကြာမီ အတည်ပြုပေးပါမည်။");
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      setToastMessage("Error: " + (e?.message || e));
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsSubmittingUpgrade(false);
    }
  };

  const handleApproveRequest = async (req: UpgradeRequest) => {
    try {
      // 1. Update user role in Firestore & backend API
      await updateUserRole(req.userId, 'premium', req.userEmail);

      // 2. Update Firestore upgrade_requests doc if exists
      try {
        if (req.id && !req.id.startsWith("req_")) {
          const reqRef = doc(db, 'upgrade_requests', req.id);
          await updateDoc(reqRef, { status: 'approved' });
        }
      } catch (e) {
        console.warn("Firestore req update notice:", e);
      }

      // 3. Update backend server upgrade request
      try {
        await fetch("/api/upgrade-requests/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: req.id, userId: req.userId, userEmail: req.userEmail })
        });
      } catch (e) {
        console.warn("API approve notice:", e);
      }

      // 4. Update local state immediately
      setUpgradeRequests((prev) => 
        prev.map((r) => r.id === req.id ? { ...r, status: 'approved' } : r)
      );
      setAllUsers((prev) =>
        prev.map((u) => (u.uid === req.userId || u.email?.toLowerCase() === req.userEmail?.toLowerCase()) ? { ...u, role: 'premium' } : u)
      );

      setToastMessage(`✅ ${req.userName} (${req.userEmail}) ကို Premium Member အဖြစ် အတည်ပြုလိုက်ပါပြီ။`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      setToastMessage("Approve error: " + (e?.message || e));
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleRejectRequest = async (req: UpgradeRequest) => {
    try {
      try {
        if (req.id && !req.id.startsWith("req_")) {
          const reqRef = doc(db, 'upgrade_requests', req.id);
          await updateDoc(reqRef, { status: 'rejected' });
        }
      } catch (e) {
        console.warn("Firestore req update notice:", e);
      }

      try {
        await fetch("/api/upgrade-requests/reject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: req.id })
        });
      } catch (e) {
        console.warn("API reject notice:", e);
      }

      setUpgradeRequests((prev) => 
        prev.map((r) => r.id === req.id ? { ...r, status: 'rejected' } : r)
      );

      setToastMessage(`${req.userName} ၏ လျှောက်ထားချက်ကို ငြင်းပယ်လိုက်ပါပြီ။`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e: any) {
      setToastMessage("Reject error: " + (e?.message || e));
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleRoleChange = async (uid: string, newRole: 'normal' | 'premium' | 'admin') => {
    try {
      const targetUser = allUsers.find(u => u.uid === uid);
      const oneMonthLater = newRole === 'premium' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : undefined;
      await updateUserRole(uid, newRole, targetUser?.email, oneMonthLater);
      setAllUsers((prev) => prev.map(u => (u.uid === uid || (targetUser?.email && u.email?.toLowerCase() === targetUser.email.toLowerCase())) ? { ...u, role: newRole, premiumExpiresAt: oneMonthLater } : u));
      setToastMessage(`User Role ကို ${newRole.toUpperCase()} (၁ လ VIP) သို့ ပြောင်းလဲပြီးပါပြီ။`);
      setTimeout(() => setToastMessage(null), 3000);
    } catch (e: any) {
      setToastMessage("Role update error: " + (e?.message || e));
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const handleForceLogout = (u: UserProfile) => {
    setForceLogoutConfirmUser(u);
  };

  const executeForceLogout = async (u: UserProfile) => {
    setIsRevoking(u.uid || u.email);
    try {
      await forceLogoutUser(u.uid, u.email, true);
      // Remove completely from allUsers list
      setAllUsers((prev) =>
        prev.filter((item) =>
          item.uid !== u.uid && (u.email ? item.email?.toLowerCase() !== u.email.toLowerCase() : true)
        )
      );
      // Remove any upgrade requests from this user
      setUpgradeRequests((prev) =>
        prev.filter((r) =>
          r.userId !== u.uid && (u.email ? r.userEmail?.toLowerCase() !== u.email.toLowerCase() : true)
        )
      );
      setToastMessage(`🚫 ${u.displayName || u.email} အား Logout ထွက်ခိုင်းပြီး Dashboard/Database မှ Gmail စာရင်းကို အပြီးအပိုင် ဖျက်ပစ်ပြီးပါပြီ။`);
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e: any) {
      setToastMessage(`❌ Logout error: ${e?.message || e}`);
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsRevoking(null);
      setForceLogoutConfirmUser(null);
    }
  };

  // Helper to deduplicate users by email
  const deduplicatedUsers = React.useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const u of allUsers) {
      if (!u) continue;
      const key = (u.email || u.uid || "").trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...u });
      } else {
        let bestRole = existing.role;
        if (u.role === 'admin' || key === 'nwe98698@gmail.com') bestRole = 'admin';
        else if (u.role === 'premium' && bestRole !== 'admin') bestRole = 'premium';

        const bestName = (existing.displayName && !existing.displayName.includes('@')) 
          ? existing.displayName 
          : (u.displayName || existing.displayName || key.split('@')[0]);

        map.set(key, {
          ...existing,
          ...u,
          displayName: bestName,
          role: bestRole,
          photoURL: existing.photoURL || u.photoURL || '',
          generationCount: Math.max(existing.generationCount || 0, u.generationCount || 0),
          premiumExpiresAt: u.premiumExpiresAt || existing.premiumExpiresAt
        });
      }
    }
    return Array.from(map.values());
  }, [allUsers]);

  // If not logged in or not admin
  const isAdminUser = userProfile && (userProfile.role === 'admin' || userProfile.email?.toLowerCase().trim() === 'nwe98698@gmail.com');

  if (!userProfile || !isAdminUser) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-[#0b1220] border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-5 shadow-2xl relative animate-scaleUp">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center mx-auto shadow-lg shadow-red-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-white">Admin Dashboard သို့ ဝင်ရောက်ခြင်း</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dashboard အင်္ဂါရပ်များ၊ အသုံးပြုသူ စီမံခန့်ခွဲမှုနှင့် လျှောက်ထားချက်များကို Admin Google Account (<span className="text-pink-400 font-bold">nwe98698@gmail.com</span>) ဖြင့် Login ဝင်ရောက်ထားသူသာလျှင် ကြည့်ရှုခွင့် ရှိပါသည်။
            </p>
          </div>

          {userProfile && !isAdminUser && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-left text-xs text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>လက်ရှိ အကောင့်မှာ Admin မဟုတ်ပါ ({userProfile.email})</span>
              </div>
              <p className="text-[11px] text-red-200/80">
                Admin Google Account (nwe98698@gmail.com) သို့ ပြောင်းလဲ ဝင်ရောက်ပေးပါ။
              </p>
            </div>
          )}

          {authNotice && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl text-left text-xs text-amber-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Google Cloud Auth API အချက်အလက်</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-normal">{authNotice}</p>
            </div>
          )}

          {/* Official Google Identity Services Native Sign-In Button */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-3.5 flex flex-col items-center justify-center shadow-inner">
            <span className="text-xs font-bold text-slate-300">
              Admin Google Account ဖြင့် Sign In ဝင်ရောက်ရန်:
            </span>
            <GoogleSignInButton 
              onSuccess={(profile) => {
                if (onGoogleSuccess) onGoogleSuccess(profile);
              }}
            />

            {/* Direct Admin Access Button */}
            <div className="w-full pt-2 border-t border-slate-800 text-center space-y-2">
              <div className="text-[11px] text-slate-400">သို့မဟုတ်</div>
              <button
                type="button"
                onClick={() => {
                  if (onEmailLogin) {
                    onEmailLogin("nwe98698@gmail.com");
                  } else if (onSelectDemoRole) {
                    onSelectDemoRole('admin');
                  }
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 via-pink-600 to-violet-600 hover:from-red-500 hover:to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 transition-all cursor-pointer active:scale-95"
              >
                <Shield className="w-4 h-4" />
                <span>Admin အဖြစ် တိုက်ရိုက်ဝင်ရောက်မည် (nwe98698@gmail.com)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPendingUpgrade = myRequests.some((r) => r.status === 'pending');

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[#0b1220] border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleUp">
        
        {/* Toast alert */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Modal Top Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {userProfile.photoURL ? (
              <img src={userProfile.photoURL} alt="Avatar" className="w-11 h-11 rounded-2xl border-2 border-slate-700 object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg">
                {userProfile.displayName?.[0] || userProfile.email?.[0] || 'U'}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">{userProfile.displayName || userProfile.email || 'User'}</h2>
                {userProfile.role === 'admin' && (
                  <span className="px-2 py-0.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-extrabold flex items-center gap-1">
                    <Shield className="w-3 h-3" /> ADMIN
                  </span>
                )}
                {userProfile.role === 'premium' && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-extrabold flex items-center gap-1">
                    <Crown className="w-3 h-3 text-amber-400" /> PREMIUM VIP
                  </span>
                )}
                {userProfile.role === 'normal' && (
                  <span className="px-2 py-0.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] font-semibold flex items-center gap-1">
                    <User className="w-3 h-3" /> NORMAL MEMBER
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">{userProfile.email || ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              title="ပိတ်မည်"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-7 space-y-6 overflow-y-auto flex-1">

          {/* 1. ADMIN DASHBOARD VIEW */}
          {userProfile.role === 'admin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-500" />
                    အဒ်မင် စီမံခန့်ခွဲမှု Dashboard (Admin Control Panel)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">User များကို Role ပြောင်းလဲခြင်း၊ Premium လျှောက်ထားချက်များ အတည်ပြုခြင်းနှင့် စနစ် စာရင်းဇယားများ</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div 
                  onClick={() => { setAdminTab('users'); setUserRoleFilter('all'); }}
                  className={`border p-3.5 rounded-2xl space-y-1 cursor-pointer transition-all ${
                    userRoleFilter === 'all' ? 'bg-slate-900 border-pink-500/60 shadow-lg' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-pink-400" /> Gmails</span>
                    <span className="text-[10px] text-slate-500">All Registered</span>
                  </div>
                  <div className="text-xl font-black text-white font-mono">{allUsers.length}</div>
                </div>

                <div 
                  onClick={() => { setAdminTab('users'); setUserRoleFilter('normal'); }}
                  className={`border p-3.5 rounded-2xl space-y-1 cursor-pointer transition-all ${
                    userRoleFilter === 'normal' ? 'bg-slate-900 border-blue-500/60 shadow-lg' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><User className="w-3.5 h-3.5 text-blue-400" /> Normal Members</span>
                    <span className="text-[10px] text-blue-400 font-bold">၅,၀၀၀ စာလုံး</span>
                  </div>
                  <div className="text-xl font-black text-blue-400 font-mono">
                    {deduplicatedUsers.filter((u) => u.role === 'normal').length}
                  </div>
                </div>

                <div 
                  onClick={() => { setAdminTab('users'); setUserRoleFilter('premium'); }}
                  className={`border p-3.5 rounded-2xl space-y-1 cursor-pointer transition-all ${
                    userRoleFilter === 'premium' ? 'bg-slate-900 border-amber-500/60 shadow-lg' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Crown className="w-3.5 h-3.5 text-amber-400" /> Premium VIP (၁ လ)</span>
                    <span className="text-[10px] text-amber-300 font-bold">၃၀,၀၀၀ စာလုံး</span>
                  </div>
                  <div className="text-xl font-black text-amber-400 font-mono">
                    {deduplicatedUsers.filter((u) => u.role === 'premium').length}
                  </div>
                </div>

                <div 
                  onClick={() => { setAdminTab('users'); setUserRoleFilter('admin'); }}
                  className={`border p-3.5 rounded-2xl space-y-1 cursor-pointer transition-all ${
                    userRoleFilter === 'admin' ? 'bg-slate-900 border-red-500/60 shadow-lg' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5 text-red-400" /> Admin Users</span>
                    <span className="text-[10px] text-red-400 font-bold">Unlimited</span>
                  </div>
                  <div className="text-xl font-black text-red-400 font-mono">
                    {deduplicatedUsers.filter((u) => u.role === 'admin' || u.email?.toLowerCase() === 'nwe98698@gmail.com').length}
                  </div>
                </div>

                <div 
                  onClick={() => { setAdminTab('users'); setUserRoleFilter('guest'); }}
                  className={`border p-3.5 rounded-2xl space-y-1 cursor-pointer transition-all col-span-2 sm:col-span-1 ${
                    userRoleFilter === 'guest' ? 'bg-slate-900 border-purple-500/60 shadow-lg' : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> Login မဝင်သူများ</span>
                    <span className="text-[10px] text-purple-400 font-bold">၃,၀၀၀ စာလုံး</span>
                  </div>
                  <div className="text-xl font-black text-purple-400 font-mono">
                    {generations.filter(g => g.userId === 'guest_anonymous' || g.userEmail?.toLowerCase().includes('guest')).length}
                  </div>
                </div>
              </div>

              {/* Admin Navigation Tabs */}
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
                <button
                  onClick={() => setAdminTab('users')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    adminTab === 'users'
                      ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  အသုံးပြုသူများ စာရင်း ({allUsers.length})
                </button>

                <button
                  onClick={() => setAdminTab('requests')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    adminTab === 'requests'
                      ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <Crown className="w-4 h-4 text-amber-400" />
                  Premium လျှောက်ထားချက်များ (
                  <span className="text-amber-300 font-bold">
                    {upgradeRequests.filter((r) => r.status === 'pending').length}
                  </span>
                  )
                </button>

                <button
                  onClick={() => setAdminTab('generations')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    adminTab === 'generations'
                      ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/20'
                      : 'bg-slate-900 text-slate-400 hover:text-white'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                  စနစ် အသံထွက်ထုတ်လုပ်မှု မှတ်တမ်းများ
                </button>
              </div>

              {/* Admin Tab 1: Users List */}
              {adminTab === 'users' && (
                <div className="space-y-4">
                  {/* Category Pills & Search */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => setUserRoleFilter('all')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          userRoleFilter === 'all'
                            ? 'bg-slate-100 text-slate-950 font-black'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        All Registered ({allUsers.length})
                      </button>

                      <button
                        onClick={() => setUserRoleFilter('normal')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          userRoleFilter === 'normal'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 text-blue-400 hover:text-blue-300 border border-slate-800'
                        }`}
                      >
                        👤 Normal ({allUsers.filter(u => u.role === 'normal').length}) - 5,000 စာလုံး
                      </button>

                      <button
                        onClick={() => setUserRoleFilter('premium')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          userRoleFilter === 'premium'
                            ? 'bg-amber-500 text-slate-950 font-black'
                            : 'bg-slate-900 text-amber-400 hover:text-amber-300 border border-slate-800'
                        }`}
                      >
                        ⭐ Premium ({allUsers.filter(u => u.role === 'premium').length}) - 30,000 စာလုံး
                      </button>

                      <button
                        onClick={() => setUserRoleFilter('admin')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          userRoleFilter === 'admin'
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-900 text-red-400 hover:text-red-300 border border-slate-800'
                        }`}
                      >
                        🛡️ Admin ({allUsers.filter(u => u.role === 'admin' || u.email?.toLowerCase() === 'nwe98698@gmail.com').length}) - Unlimited
                      </button>

                      <button
                        onClick={() => setUserRoleFilter('guest')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          userRoleFilter === 'guest'
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-900 text-purple-400 hover:text-purple-300 border border-slate-800'
                        }`}
                      >
                        💡 Guest Users ({generations.filter(g => g.userId === 'guest_anonymous' || g.userEmail?.toLowerCase().includes('guest')).length}) - 3,000 စာလုံး
                      </button>
                    </div>

                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Gmail သို့မဟုတ် အမည် ရှာရန်..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-pink-500"
                      />
                    </div>
                  </div>

                  {/* Standard Users Table */}
                  {userRoleFilter !== 'guest' ? (
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                            <tr>
                              <th className="p-3.5">User Profile & Gmail</th>
                              <th className="p-3.5">Role</th>
                              <th className="p-3.5">Max Quota</th>
                              <th className="p-3.5">Total Usage</th>
                              <th className="p-3.5">Joined Date</th>
                              <th className="p-3.5 text-right">Role Change Controls</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80 text-slate-300">
                            {deduplicatedUsers
                              .filter((u) => {
                                const emailStr = u.email?.toLowerCase() || '';
                                const nameStr = u.displayName?.toLowerCase() || '';
                                const q = searchQuery.toLowerCase();
                                const matchesSearch = emailStr.includes(q) || nameStr.includes(q);
                                if (!matchesSearch) return false;

                                if (userRoleFilter === 'normal') return u.role === 'normal';
                                if (userRoleFilter === 'premium') return u.role === 'premium';
                                if (userRoleFilter === 'admin') return u.role === 'admin' || emailStr === 'nwe98698@gmail.com';
                                return true;
                              })
                              .map((u) => {
                                const userEmail = u.email || '';
                                const isUserAdmin = u.role === 'admin' || userEmail.toLowerCase() === 'nwe98698@gmail.com';
                                const daysLeft = u.premiumExpiresAt 
                                  ? Math.max(0, Math.ceil((new Date(u.premiumExpiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                  : 30;

                                return (
                                <tr key={u.email || u.uid} className="hover:bg-slate-900/50 transition-colors">
                                  <td className="p-3.5 flex items-center gap-3">
                                    {u.photoURL ? (
                                      <img src={u.photoURL} className="w-9 h-9 rounded-full border border-slate-700 object-cover shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-white shrink-0">
                                        {u.displayName?.[0] || userEmail[0] || 'U'}
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <div className="font-bold text-white truncate">{u.displayName || userEmail || 'User'}</div>
                                      <div className="text-[11px] text-pink-400 font-mono font-semibold truncate">{userEmail || 'No email'}</div>
                                    </div>
                                  </td>

                                  <td className="p-3.5">
                                    {isUserAdmin && (
                                      <span className="px-2.5 py-1 rounded-xl bg-red-500/20 text-red-400 font-extrabold text-[10px] border border-red-500/40 flex items-center gap-1 w-max">
                                        <Shield className="w-3 h-3" /> ADMIN
                                      </span>
                                    )}
                                    {u.role === 'premium' && !isUserAdmin && (
                                      <div className="space-y-0.5">
                                        <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-extrabold text-[10px] border border-amber-500/40 flex items-center gap-1 w-max">
                                          <Crown className="w-3 h-3 text-amber-400" /> PREMIUM VIP
                                        </span>
                                        <span className="text-[10px] text-amber-400 font-bold block font-mono pl-1">
                                          ⏱️ ၁ လ VIP ({daysLeft} ရက်ကျန်)
                                        </span>
                                      </div>
                                    )}
                                    {u.role === 'normal' && !isUserAdmin && (
                                      <span className="px-2.5 py-1 rounded-xl bg-blue-500/20 text-blue-300 font-bold text-[10px] border border-blue-500/30 flex items-center gap-1 w-max">
                                        <User className="w-3 h-3" /> NORMAL MEMBER
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3.5 font-mono">
                                    {isUserAdmin ? (
                                      <span className="text-red-400 font-bold">∞ Unlimited</span>
                                    ) : u.role === 'premium' ? (
                                      <span className="text-amber-300 font-bold">၃၀,၀၀၀ စာလုံး</span>
                                    ) : (
                                      <span className="text-blue-400 font-semibold">၅,၀၀၀ စာလုံး</span>
                                    )}
                                  </td>

                                  <td className="p-3.5 font-mono text-slate-300">
                                    <span className="font-bold text-white">{u.generationCount || 0}</span> ကြိမ်
                                  </td>

                                  <td className="p-3.5 text-slate-400 text-[11px] font-mono">
                                    {u.createdAt ? u.createdAt.split('T')[0] : 'N/A'}
                                  </td>

                                  <td className="p-3.5 text-right">
                                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                      {u.role !== 'normal' && !isUserAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleRoleChange(u.uid, 'normal')}
                                          className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition-all cursor-pointer active:scale-95"
                                        >
                                          👤 Normal
                                        </button>
                                      )}

                                      {u.role !== 'premium' && !isUserAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleRoleChange(u.uid, 'premium')}
                                          className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                                        >
                                          <Crown className="w-3 h-3" /> Make Premium (၁ လ)
                                        </button>
                                      )}

                                      {u.role !== 'admin' && !isUserAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleRoleChange(u.uid, 'admin')}
                                          className="px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-[11px] font-bold transition-all cursor-pointer active:scale-95"
                                        >
                                          🛡️ Make Admin
                                        </button>
                                      )}

                                      {!isUserAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleForceLogout(u)}
                                          className="px-2.5 py-1 rounded-xl bg-red-950/60 hover:bg-red-900/80 border border-red-700/60 text-red-300 hover:text-white text-[11px] font-bold transition-all cursor-pointer active:scale-95 flex items-center gap-1"
                                          title="User Session ကို ဖျက်သိမ်းပြီး အကောင့်မှ Logout ထွက်ခိုင်းမည်"
                                        >
                                          <LogOut className="w-3 h-3 text-red-400" /> Logout ထွက်ခိုင်းမည်
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );})}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    /* Guest Users Table */
                    <div className="bg-slate-950 border border-purple-500/30 rounded-2xl overflow-hidden shadow-md space-y-3 p-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-purple-300 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                            Google Login မဝင်ဘဲ အသုံးပြုသူများ၏ အသံထွက်ထုတ်ယူမှု မှတ်တမ်းများ
                          </h4>
                          <p className="text-xs text-slate-400 mt-0.5">Google Account မဝင်ထားဘဲ အသံပြောင်းထားသော စာသားများနှင့် အသုံးပြုမှု အကြိမ်ရေများ (တစ်ကြိမ်လျှင် စာသား ၃,၀၀၀ စာလုံးအထိ)</p>
                        </div>
                        <span className="px-3 py-1 rounded-xl bg-purple-500/20 text-purple-300 text-xs font-mono font-bold border border-purple-500/40">
                          {generations.filter(g => g.userId === 'guest_anonymous' || g.userEmail?.toLowerCase().includes('guest')).length} Request Logs
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                            <tr>
                              <th className="p-3">User Type</th>
                              <th className="p-3">Converted Text Snippet</th>
                              <th className="p-3">Voice Actor</th>
                              <th className="p-3">Quota Limit</th>
                              <th className="p-3 text-right">Timestamp</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/80 text-slate-300">
                            {generations
                              .filter(g => g.userId === 'guest_anonymous' || g.userEmail?.toLowerCase().includes('guest'))
                              .map((g, idx) => (
                                <tr key={g.id || idx} className="hover:bg-slate-900/50 transition-colors">
                                  <td className="p-3 font-semibold text-purple-300 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                    <span>Guest User (No Login)</span>
                                  </td>
                                  <td className="p-3 text-slate-200 truncate max-w-xs font-sans">
                                    "{g.text}"
                                  </td>
                                  <td className="p-3 font-mono text-pink-400 font-semibold">
                                    {g.voice}
                                  </td>
                                  <td className="p-3 font-mono text-amber-400 text-[11px]">
                                    ၃,၀၀၀ စာလုံးအထိ
                                  </td>
                                  <td className="p-3 text-right text-slate-500 text-[11px] font-mono">
                                    {g.createdAt ? new Date(g.createdAt).toLocaleString('en-US', { hour12: true }) : 'Just Now'}
                                  </td>
                                </tr>
                              ))}

                            {generations.filter(g => g.userId === 'guest_anonymous' || g.userEmail?.toLowerCase().includes('guest')).length === 0 && (
                              <tr>
                                <td colSpan={5} className="p-6 text-center text-slate-500">
                                  Guest အသုံးပြုသူများ၏ အသံထွက်ထုတ်ယူမှု မှတ်တမ်း မရှိသေးပါ။
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Admin Tab 2: Premium Upgrade Requests */}
              {adminTab === 'requests' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                    <div className="text-xs text-slate-300 flex items-center gap-2">
                      <span className="font-bold text-white">ငွေလွှဲပြေစာ တင်ထားသော လျှောက်ထားချက်များ</span>
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 font-bold font-mono text-[11px] border border-amber-500/30">
                        {upgradeRequests.filter(r => r.status === 'pending').length} ခု ကျန်ရှိ
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        fetchServerData();
                        setToastMessage("စာရင်းများကို အသစ်ပြန်လည်ရယူလိုက်ပါပြီ။");
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-pink-400" />
                      <span>Refresh ပြန်ယူမည်</span>
                    </button>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                          <tr>
                            <th className="p-3.5">User Profile & Gmail</th>
                            <th className="p-3.5">Payment Slip (ငွေလွှဲပြေစာ)</th>
                            <th className="p-3.5">Plan</th>
                            <th className="p-3.5">Request Date</th>
                            <th className="p-3.5">Status</th>
                            <th className="p-3.5 text-right">Approve / Reject</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 text-slate-300">
                          {upgradeRequests.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center py-8 text-slate-500">
                                မည်သည့် လျှောက်ထားချက်မှ မရှိသေးပါ။
                              </td>
                            </tr>
                          ) : (
                            upgradeRequests.map((req) => (
                              <tr key={req.id} className="hover:bg-slate-900/50 transition-colors">
                                <td className="p-3.5">
                                  <div className="font-bold text-white text-sm">{req.userName}</div>
                                  <div className="text-[11px] text-pink-400 font-mono font-semibold">{req.userEmail}</div>
                                </td>

                                <td className="p-3.5">
                                  {req.paymentSlipBase64 ? (
                                    <button
                                      type="button"
                                      onClick={() => setSelectedSlipPreview(req.paymentSlipBase64 || null)}
                                      className="relative group rounded-xl overflow-hidden border border-amber-500/40 bg-slate-900 p-1 block cursor-pointer transition-transform hover:scale-105"
                                      title="ပုံကြီးကြည့်ရန် နှိပ်ပါ"
                                    >
                                      <img 
                                        src={req.paymentSlipBase64} 
                                        alt="Wave Money Slip" 
                                        className="w-14 h-14 object-cover rounded-lg" 
                                      />
                                      <span className="absolute inset-0 bg-black/40 group-hover:bg-black/10 transition-colors flex items-center justify-center text-[9px] text-white font-bold">
                                        ကြီးကြည့်မည်
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-500 italic">Slip မပါပါ</span>
                                  )}
                                </td>

                                <td className="p-3.5 font-semibold text-amber-300">
                                  {req.plan || 'Premium Member (30,000 Chars)'}
                                </td>

                                <td className="p-3.5 text-slate-400 text-[11px] font-mono">
                                  {req.createdAt ? new Date(req.createdAt).toLocaleString('en-US', { hour12: true }) : 'N/A'}
                                </td>

                                <td className="p-3.5">
                                  {req.status === 'pending' && (
                                    <span className="px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold border border-amber-500/40">
                                      PENDING
                                    </span>
                                  )}
                                  {req.status === 'approved' && (
                                    <span className="px-2.5 py-1 rounded-xl bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/40">
                                      APPROVED
                                    </span>
                                  )}
                                  {req.status === 'rejected' && (
                                    <span className="px-2.5 py-1 rounded-xl bg-red-500/20 text-red-400 font-mono text-[10px] font-bold border border-red-500/40">
                                      REJECTED
                                    </span>
                                  )}
                                </td>

                                <td className="p-3.5 text-right">
                                  {req.status === 'pending' ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={() => handleApproveRequest(req)}
                                        className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
                                      >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>⭐ Premium သို့ အတည်ပြုမည်</span>
                                      </button>
                                      <button
                                        onClick={() => handleRejectRequest(req)}
                                        className="px-2.5 py-1.5 rounded-xl bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-300 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1"
                                      >
                                        <XCircle className="w-3.5 h-3.5" />
                                        <span>ငြင်းပယ်မည်</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-slate-500 text-[11px] font-mono">Completed</span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Admin Tab 3: System Generation Logs */}
              {adminTab === 'generations' && (
                <div className="space-y-4">
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-md">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                          <tr>
                            <th className="p-3.5">User Email</th>
                            <th className="p-3.5">Voice</th>
                            <th className="p-3.5">Text Snippet</th>
                            <th className="p-3.5">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 text-slate-300">
                          {generations.map((gen) => (
                            <tr key={gen.id} className="hover:bg-slate-900/50 transition-colors">
                              <td className="p-3.5 font-medium text-pink-400">{gen.userEmail}</td>
                              <td className="p-3.5 text-slate-300 font-mono text-[11px]">{gen.voice}</td>
                              <td className="p-3.5 text-slate-200 truncate max-w-xs">{gen.text}</td>
                              <td className="p-3.5 text-slate-500 text-[11px] font-mono">
                                {gen.createdAt ? gen.createdAt.replace('T', ' ').slice(0, 16) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* 2. PREMIUM USER DASHBOARD VIEW */}
          {userProfile.role === 'premium' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-pink-500/15 border border-amber-500/30 p-6 rounded-3xl space-y-4 relative overflow-hidden">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
                    <Crown className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      မင်္ဂလာပါ VIP {userProfile.displayName}
                    </h3>
                    <p className="text-xs text-amber-200/90 font-medium">
                      သင့်အကောင့်မှာ ⭐ Premium VIP Member အဆင့်ဖြစ်သဖြင့် စීමသတ်မရှိ MP3 အသံဖိုင်နှင့် SRT Subtitles များကို ရယူနိုင်ပါပြီ။
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                    <div className="text-[11px] text-slate-400">Daily Generation Limit</div>
                    <div className="text-base font-black text-emerald-400 flex items-center gap-1">
                      <Zap className="w-4 h-4" /> Unlimited (ကန့်သတ်ချက်မရှိ)
                    </div>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                    <div className="text-[11px] text-slate-400">Total Voices Generated</div>
                    <div className="text-base font-black text-white font-mono">
                      {userProfile.generationCount || 0} MP3s
                    </div>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl space-y-1">
                    <div className="text-[11px] text-slate-400">SRT Subtitles Access</div>
                    <div className="text-base font-black text-amber-300 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Full Access Enabled
                    </div>
                  </div>
                </div>
              </div>

              {/* Premium Perks List */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider text-slate-400">Premium Exclusive Features</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>တစ်ရက်လျှင် စိတ်ကြိုက် MP3 အရေအတွက်မကန့်သတ်</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>.SRT စာတန်းထိုး Subtitle ဖိုင် ၁ ကြောင်း / ၂ ကြောင်း ရယူခွင့်</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>မြန်နှုန်းမြင့် High-Speed Audio Render Engine</span>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>အသံ Pitch / Speed Fine-Tuning ထိန်းချုပ်ခွင့်</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. NORMAL USER DASHBOARD VIEW */}
          {userProfile.role === 'normal' && (
            <div className="space-y-6">
              {/* Daily Quota Card */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-400" />
                      မင်္ဂလာပါ {userProfile.displayName} (Normal Member)
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">နေ့စဉ် အခမဲ့ အသံဖိုင် ထုတ်လုပ်မှု ပမာဏနှင့် အကောင့် အဆင့်မြှင့်တင်ခြင်း</p>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-2xl text-right">
                    <div className="text-[11px] text-slate-400">ယနေ့ အသုံးပြုမှု</div>
                    <div className="text-base font-black text-pink-400 font-mono">
                      {userProfile.dailyGenerations || 0} / 10 MP3s
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400 font-medium">
                    <span>ယနေ့ကျန်ရှိသော အခမဲ့ အသံထုတ်လုပ်မှု</span>
                    <span className="text-slate-200 font-bold">{Math.max(0, 10 - (userProfile.dailyGenerations || 0))} ချိန် ကျန်ပါသေးသည်</span>
                  </div>
                  <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-pink-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((userProfile.dailyGenerations || 0) / 10) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Upgrade Request Card */}
              <div className="bg-gradient-to-br from-purple-900/20 via-slate-900 to-pink-900/20 border border-purple-500/30 rounded-3xl p-6 space-y-5 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[11px] font-bold inline-flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5 text-amber-400" /> Premium VIP Upgrade
                    </span>
                    <h4 className="text-lg font-black text-white">
                      ⭐ Premium Member သို့ အဆင့်မြှင့်တင်ပါ
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                      နေ့စဉ် ကန့်သတ်ချက်မရှိ စိတ်ကြိုက် MP3 အသံဖိုင်နှင့် SRT စာတန်းထိုး Subtitle ဖိုင်များကို တိုက်ရိုက် ဒေါင်းလုဒ် ရယူနိုင်ရန် အကောင့်ကို အဆင့်မြှင့်တင်လိုက်ပါ။
                    </p>
                  </div>
                </div>

                {/* Feature Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
                  <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="font-bold text-slate-400">Normal (လက်ရှိ)</div>
                    <ul className="space-y-1.5 text-slate-400 text-[11px]">
                      <li>• နေ့စဉ် ၁၀ ကြိမ်သာ ပြုလုပ်နိုင်ခြင်း</li>
                      <li>• စံသတ်မှတ် အသံထွက်များ</li>
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                    <div className="font-bold text-amber-300 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> Premium VIP
                    </div>
                    <ul className="space-y-1.5 text-amber-200 text-[11px]">
                      <li>✓ နေ့စဉ် အသံထုတ်လုပ်မှု စိတ်ကြိုက် ကန့်သတ်ချက်မရှိ</li>
                      <li>✓ .SRT Subtitle တိုက်ရိုက် ဒေါင်းလုဒ်ခွင့်</li>
                      <li>✓ High Speed Priority Engine</li>
                    </ul>
                  </div>
                </div>

                {/* Upgrade Button */}
                <div className="pt-2">
                  {isPendingUpgrade ? (
                    <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-2">
                      <Clock className="w-4 h-4 animate-spin text-amber-400" />
                      <span>သင့်၏ Premium အဆင့်မြှင့်တင်ရန် လျှောက်ထားချက်ကို Admin မှ စိစစ်နေပါသည်...</span>
                    </div>
                  ) : (
                    <button
                      onClick={handleRequestUpgrade}
                      disabled={isSubmittingUpgrade}
                      className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-pink-600 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white font-extrabold text-sm shadow-xl shadow-pink-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                    >
                      {isSubmittingUpgrade ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>လျှောက်ထားနေပါသည်...</span>
                        </>
                      ) : (
                        <>
                          <Crown className="w-5 h-5 text-amber-300" />
                          <span>Premium Member အဆင့်မြှင့်တင်ရန် လျှောက်ထားမည်</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* Force Logout Confirmation Modal */}
      {forceLogoutConfirmUser && (
        <div className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-[#0e1626] border border-red-500/40 rounded-3xl p-6 space-y-5 shadow-2xl shadow-red-950/50 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Logout & Gmail စာရင်းဖျက်မည်လား?</h3>
                  <span className="text-[10px] text-red-400 font-medium">Session Revocation & Account Deletion</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setForceLogoutConfirmUser(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5 text-left">
              <div className="text-xs font-bold text-white truncate">
                အမည်: {forceLogoutConfirmUser.displayName || 'User'}
              </div>
              <div className="text-[11px] font-mono text-pink-400 truncate">
                Gmail: {forceLogoutConfirmUser.email}
              </div>
              <div className="text-[11px] text-slate-400">
                လက်ရှိအဆင့်: <span className="uppercase font-bold text-amber-300">{forceLogoutConfirmUser.role}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed text-left">
              အဆိုပါ အသုံးပြုသူ၏ လက်ရှိ Login Session ကို ချက်ချင်း ဖျက်သိမ်းပြီး အကောင့်မှ Logout ဖြစ်သွားစေမည်ဖြစ်ကာ <span className="font-bold text-red-400">Admin Dashboard နှင့် Database မှ Gmail စာရင်းကို အပြီးအပိုင် ဖျက်ပစ်ပါမည်</span>။
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setForceLogoutConfirmUser(null)}
                disabled={!!isRevoking}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all cursor-pointer"
              >
                မလုပ်တော့ပါ (Cancel)
              </button>
              <button
                type="button"
                onClick={() => executeForceLogout(forceLogoutConfirmUser)}
                disabled={!!isRevoking}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {isRevoking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>ဖျက်သိမ်းနေပါသည်...</span>
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>သေချာပါသည် Logout & စာရင်းဖျက်မည်</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Slip Enlarged Modal Preview */}
      {selectedSlipPreview && (
        <div className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-3 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-amber-300">
                Wave Money ငွေလွှဲပြေစာ (Slip) စိစစ်ရန်
              </span>
              <button
                type="button"
                onClick={() => setSelectedSlipPreview(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto flex items-center justify-center bg-black/50 rounded-2xl p-2">
              <img 
                src={selectedSlipPreview} 
                alt="Enlarged Slip" 
                className="max-h-[75vh] w-auto object-contain rounded-xl shadow-2xl" 
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
