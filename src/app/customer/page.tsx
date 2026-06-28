"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { 
  Award, Loader2, Sparkles, LogOut, Camera, XCircle, 
  CheckCircle2, RefreshCw, Smartphone, TrendingUp, Gift, Send,
  QrCode, Copy, Check, Users, ShieldAlert, CheckCircle
} from "lucide-react";

interface ProfileData {
  currentPoints: number;
  pendingPoints: number;
  totalPoints: number;
  role: string;
  otpCode: string;
  redeemedRewardIds?: string[];
}

const CatPaw = ({ active, className = "" }: { active: boolean; className?: string }) => (
  <svg viewBox="0 0 100 100" className={`w-12 h-12 transition-all duration-500 ${className} ${active ? "fill-[#FF7DA0] stroke-[#FF7DA0] scale-110 drop-shadow-md animate-pulse" : "fill-slate-100 stroke-slate-300"}`} strokeWidth="4">
    {/* Main Pad */}
    <path d="M 30,70 C 25,50 35,40 50,40 C 65,40 75,50 70,70 C 65,85 35,85 30,70 Z" />
    {/* Toe Pads */}
    <circle cx="22" cy="35" r="10" />
    <circle cx="40" cy="22" r="11" />
    <circle cx="60" cy="22" r="11" />
    <circle cx="78" cy="35" r="10" />
  </svg>
);

export default function CustomerDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingSession, setSyncingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | null }>({ message: "", type: null });
  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ message: msg, type });
    const timer = setTimeout(() => setToast({ message: "", type: null }), 4000);
    return timer;
  };

  // LIFF State
  const [liffInstance, setLiffInstance] = useState<any>(null);

  // Toggle State to show/hide 6-digit OTP code
  const [showOtpCode, setShowOtpCode] = useState(false);

  // Redemption QR Code State
  const [activeRedeemToken, setActiveRedeemToken] = useState<string | null>(null);
  const [redeemQrUrl, setRedeemQrUrl] = useState<string | null>(null);
  const [redeemTtl, setRedeemTtl] = useState(0);
  const [generatingRedeem, setGeneratingRedeem] = useState(false);
  const [copiedRedeem, setCopiedRedeem] = useState(false);

  // v3.0 Dynamic Config States
  interface Reward {
    id: string;
    name: string;
    points: number;
    isActive?: boolean;
  }
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [announcement, setAnnouncement] = useState<string>("");
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);

  // Scanning UI triggers
  const [scanning, setScanning] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);

  // Apply Staff Modal State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [applyingStaff, setApplyingStaff] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Dynamic automatic redemption checking polling
  useEffect(() => {
    if (!activeRedeemToken) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/customer/redeem-status?token=${activeRedeemToken}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.status === "USED") {
            showToast("🎉 แลกของรางวัลสำเร็จเรียบร้อยแล้ว!", "success");
            setActiveRedeemToken(null);
            setRedeemQrUrl(null);
            setRedeemTtl(0);
            setSelectedReward(null);
            await fetchProfile();
          } else if (data.success && data.status === "EXPIRED") {
            showToast("⚠️ คูปองหมดอายุแล้ว", "error");
            setActiveRedeemToken(null);
            setRedeemQrUrl(null);
            setRedeemTtl(0);
            setSelectedReward(null);
          }
        }
      } catch (err) {
        console.error("Error polling redemption status:", err);
      }
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeRedeemToken]);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/merchant/config");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRewards(data.rewards || []);
          setAnnouncement(data.announcement || "");
        }
      }
    } catch (err) {
      console.error("Failed to fetch shop configuration:", err);
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/customer/profile");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/");
          return;
        }
        throw new Error("ไม่สามารถดึงข้อมูลแต้มสะสมได้");
      }
      const data = await res.json();
      if (data.success) {
        setProfile({
          currentPoints: data.currentPoints,
          pendingPoints: data.pendingPoints,
          totalPoints: data.totalPoints,
          role: data.role,
          otpCode: data.otpCode,
          redeemedRewardIds: data.redeemedRewardIds || [],
        });
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการดึงข้อมูลแต้มสะสม");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        const liff = (await import("@line/liff")).default;
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          console.error("LIFF ID is missing in environment variables.");
          setSyncingSession(false);
          return;
        }
        await liff.init({ liffId });
        setLiffInstance(liff);

        if (!liff.isLoggedIn()) {
          router.push("/");
          return;
        }

        setSyncingSession(false);
        await fetchProfile();
        await fetchConfig(); // Load rewards and announcement on load
      } catch (err) {
        console.error("LIFF initialization failed on customer dashboard", err);
        setError("เกิดข้อผิดพลาดในการเชื่อมต่อ LINE LIFF");
        setSyncingSession(false);
      }
    };
    initLiff();
  }, [router]);

  // Redirect admin or staff to merchant dashboard unless testing the customer view
  useEffect(() => {
    if (profile && (profile.role === "ADMIN" || profile.role === "STAFF" || profile.role === "MERCHANT")) {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("test") !== "true") {
        router.push("/merchant");
      }
    }
  }, [profile, router]);

  // Countdown timer for Customer Redemption Coupon QR
  useEffect(() => {
    if (redeemTtl <= 0) {
      setActiveRedeemToken(null);
      setRedeemQrUrl(null);
      setSelectedReward(null);
      return;
    }
    const timer = setInterval(() => {
      setRedeemTtl((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [redeemTtl]);

  const handleLogout = async () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    if (liffInstance) {
      liffInstance.logout();
    }
    router.push("/");
  };

  const handleGenerateRedeemQR = async (reward: Reward) => {
    const totalPoints = (profile?.currentPoints ?? 0) + (profile?.pendingPoints ?? 0);
    if (totalPoints < reward.points) return;
    
    setSelectedReward(reward);
    setGeneratingRedeem(true);
    setError(null);
    setSuccessMsg(null);
    setCopiedRedeem(false);

    try {
      const res = await fetch("/api/customer/generate-redeem-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rewardId: reward.id,
          rewardPoints: reward.points,
          rewardName: reward.name,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "ไม่สามารถสร้างคูปองแลกรางวัลได้");
      }

      const rawToken = data.token;
      setActiveRedeemToken(rawToken);

      // Render redemption coupon QR
      const payloadString = JSON.stringify({ token: rawToken });
      const qrDataUrl = await QRCode.toDataURL(payloadString, {
        width: 300,
        margin: 2,
        color: {
          dark: "#3D3839", // Standard dark charcoal foreground
          light: "#FFFFFF", // Standard high-contrast white background
        },
      });

      setRedeemQrUrl(qrDataUrl);
      setRedeemTtl(300); // 5 Minutes
    } catch (err: any) {
      setError(err.message || "ไม่สามารถขอคูปองแลกของรางวัลได้");
      setSelectedReward(null);
    } finally {
      setGeneratingRedeem(false);
    }
  };

  const copyRedeemTokenToClipboard = () => {
    if (!activeRedeemToken) return;
    navigator.clipboard.writeText(activeRedeemToken);
    setCopiedRedeem(true);
    setTimeout(() => setCopiedRedeem(false), 2000);
  };

  const startScanner = async () => {
    if (!liffInstance) {
      setError("ระบบสแกน LINE ยังไม่พร้อมใช้งาน");
      return;
    }

    try {
      setScanning(true);
      setError(null);
      setScanResultMsg(null);
      setSuccessMsg(null);

      const result = await liffInstance.scanCodeV2();
      const decodedText = result.value;

      if (decodedText) {
        let targetToken = decodedText;
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed.token) targetToken = parsed.token;
        } catch (e) {
          // Raw text fallback
        }
        await processScannedToken(targetToken);
      }
    } catch (err: any) {
      console.error("LIFF scanning failed:", err);
      showToast("การสแกนโค้ดล้มเหลว หรือไม่ได้รับอนุญาตให้ใช้กล้อง", "error");
    } finally {
      setScanning(false);
    }
  };

  const processScannedToken = async (token: string) => {
    setLoading(true);
    setError(null);
    setScanResultMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/customer/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "การรับแต้มถูกปฏิเสธ");
      }

      showToast(`🎉 สะสมแต้มสำเร็จเพิ่มอีก +${data.addedPoints} แต้ม!`, "success");
      await fetchProfile();
    } catch (err: any) {
      showToast(err.message || "ไม่สามารถสะสมแต้มจากรหัสนี้ได้", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) {
      setApplyError("กรุณากรอกชื่อแสดงผลพนักงาน");
      return;
    }
    if (!secretCode.trim()) {
      setApplyError("กรุณากรอกรหัสผ่านลับพนักงาน");
      return;
    }

    setApplyingStaff(true);
    setApplyError(null);

    try {
      const res = await fetch("/api/customer/apply-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: staffName.trim(), code: secretCode.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "สมัครสิทธิ์พนักงานไม่สำเร็จ");
      }

      setSuccessMsg("ส่งคำขอสมัครพนักงานเสร็จสิ้น กรุณารอแอดมินอนุมัติสิทธิ์");
      setShowApplyModal(false);
      await fetchProfile();
    } catch (err: any) {
      setApplyError(err.message || "เกิดข้อผิดพลาดในการสมัครสิทธิ์");
    } finally {
      setApplyingStaff(false);
    }
  };

  if (syncingSession || (loading && !profile)) {
    return (
      <div className="min-h-screen bg-[#FFF5F6] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[#FF7DA0] animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-semibold">กำลังยืนยันตัวตนกับ LINE...</p>
      </div>
    );
  }

  // 1. Render PENDING_APPROVAL Screen Overlay
  if (profile?.role === "PENDING_APPROVAL") {
    return (
      <main className="min-h-screen bg-[#FFF5F6] text-[#4A3E3F] p-6 flex flex-col items-center justify-center relative overflow-hidden font-sans select-none">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#FFE2E6]/50 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-[#FFE2E6]/50 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-sm bg-white border border-pink-100/50 rounded-3xl p-8 shadow-sm flex flex-col items-center text-center space-y-6 relative z-10">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center animate-bounce">
            <Users className="w-10 h-10 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">ส่งคำขอสิทธิ์เรียบร้อยแล้ว</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              ระบบกำลังตรวจสอบและอนุมัติสิทธิ์พนักงานโดยผู้ดูแลระบบ (Admin)<br />
              กรุณารอสักครู่และรีเฟรชหน้านี้ หรือติดต่อผู้จัดการร้าน
            </p>
          </div>

          <div className="flex w-full gap-2 pt-2">
            <button
              onClick={fetchProfile}
              className="flex-1 py-3 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl text-sm font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.96]"
            >
              <RefreshCw className="w-4 h-4" />
              รีเฟรชข้อมูล
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-sm font-bold transition-all cursor-pointer active:scale-[0.96]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    );
  }

  const currentPoints = profile?.currentPoints ?? 0;
  const pendingPoints = profile?.pendingPoints ?? 0;
  const formatOtp = (code: string) => {
    if (!code || code.length !== 6) return code;
    return `${code.slice(0, 3)}-${code.slice(3)}`;
  };

  return (
    <main className="min-h-screen bg-[#FFF5F6] text-[#4A3E3F] p-6 relative overflow-hidden font-sans select-none">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-[#FFE2E6]/50 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-[#FFE2E6]/50 blur-[120px] pointer-events-none" />

      <div className="max-w-md mx-auto relative z-10 space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-[#FFFFFF] border border-pink-100/50 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#FF7DA0] rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm tracking-tight text-[#5C5556]">สะสมแต้ม Sucha Shop</span>
              {profile?.role === "STAFF" && <span className="text-[9px] text-[#FF7DA0] font-bold">พนักงานร้าน</span>}
              {profile?.role === "ADMIN" && <span className="text-[9px] text-amber-500 font-bold">ผู้ดูแลระบบ</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {(profile?.role === "STAFF" || profile?.role === "ADMIN") && (
              <button
                onClick={() => router.push("/merchant")}
                className="px-3 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
              >
                ระบบร้านค้า
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-slate-450 hover:text-[#FF7DA0] bg-[#F9F9F9] border border-pink-100/30 rounded-xl transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {(successMsg || scanResultMsg) && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-start gap-3 text-xs animate-fade-in relative shadow-sm text-left">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{successMsg || scanResultMsg}</span>
            </div>
            <button 
              onClick={() => { setSuccessMsg(null); setScanResultMsg(null); }}
              className="absolute top-2 right-2 text-emerald-450 hover:text-emerald-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-start gap-3 text-xs animate-shake relative shadow-sm text-left">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{error}</span>
            </div>
            <button 
              onClick={() => setError(null)}
              className="absolute top-2 right-2 text-red-450 hover:text-red-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Redemption Coupon QR Card (Displays when active) */}
        {redeemQrUrl && activeRedeemToken ? (
          <div className="bg-[#FFFFFF] border border-pink-100/50 p-6 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 animate-fade-in text-left">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#5C5556] flex items-center gap-1.5 self-start">
              <Gift className="w-4 h-4 text-[#FF7DA0] animate-bounce" />
              คูปองแลกรับของรางวัล
            </h3>
            
            <div className="w-full bg-[#FCF8F9] border border-pink-100/20 rounded-2xl p-4 space-y-2">
              <div className="text-xs text-slate-500 font-semibold flex justify-between">
                <span>ของรางวัล:</span>
                <span className="text-[#FF7DA0] font-bold">{selectedReward?.name || "ของรางวัล"}</span>
              </div>
              <div className="text-xs text-slate-500 font-semibold flex justify-between">
                <span>คะแนนที่ใช้แลก:</span>
                <span className="text-slate-800 font-bold">{selectedReward?.points ?? 5} คะแนน</span>
              </div>
            </div>

            <div className="p-3 bg-[#F9F9F9] border border-pink-100/30 rounded-2xl shadow-inner">
              <img src={redeemQrUrl} alt="คูปอง QR Code สำหรับแลกของรางวัล" className="w-52 h-52 rounded-xl" />
            </div>

            <div className="text-center">
              <p className="text-[10px] text-slate-400">ยื่น QR โค้ดนี้ให้พนักงานสแกน คูปองหมดอายุใน:</p>
              <p className="text-md font-bold text-[#FF7DA0] mt-0.5">
                {Math.floor(redeemTtl / 60)}:{(redeemTtl % 60).toString().padStart(2, "0")}
              </p>
            </div>

            <button
              onClick={() => {
                setActiveRedeemToken(null);
                setRedeemQrUrl(null);
                setSelectedReward(null);
              }}
              className="w-full py-3 bg-[#F9F9F9] border border-pink-100/30 hover:bg-[#FFE2E6]/30 text-slate-500 hover:text-[#5C5556] rounded-xl text-xs font-semibold cursor-pointer transition-all"
            >
              ยกเลิกคูปอง
            </button>
          </div>
        ) : (
          <>
            {/* 1. Points Dashboard Card */}
            <div className="bg-[#FFFFFF] border border-pink-100/50 p-6 rounded-3xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden text-left">
              
              <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 bg-[#F9F9F9] border border-pink-100/30 rounded-xl text-xs text-slate-400 hover:text-[#5C5556] cursor-pointer transition-all animate-pulse" onClick={async () => { await fetchProfile(); await fetchConfig(); }}>
                <RefreshCw className="w-3 h-3" />
                รีเฟรช
              </div>
   
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-450 mb-1 self-start">
                คะแนนสะสมทั้งหมดของคุณ (Lifetime Points)
              </h2>

              <div className="w-full flex flex-col items-center justify-center py-5 bg-gradient-to-tr from-[#FFF5F6] to-[#FFF0F2] border border-pink-100/30 rounded-2xl shadow-inner mb-4">
                <span className="text-5xl font-extrabold text-[#FF7DA0] font-sans tracking-tight">
                  {(profile?.currentPoints ?? 0) + (profile?.pendingPoints ?? 0)}
                </span>
                <span className="text-[10px] text-[#FF7DA0]/80 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 animate-spin" />
                  คะแนนพร้อมใช้สะสม
                </span>
              </div>

              {/* OTP Code Display Container */}
              {profile?.otpCode && (
                <div className="w-full mt-4 flex flex-col items-center justify-center">
                  {!showOtpCode ? (
                    <button
                      onClick={() => setShowOtpCode(true)}
                      className="py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-[0.98] w-full"
                    >
                      แสดงรหัสสะสมแต้มสำหรับกรณีกล้องมีปัญหา
                    </button>
                  ) : (
                    <div className="w-full bg-[#FCF8F9] border border-pink-100/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-1 shadow-sm relative">
                      <button
                        onClick={() => setShowOtpCode(false)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-[#FF7DA0] text-[10px] cursor-pointer"
                      >
                        ซ่อน
                      </button>
                      <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">
                        รหัสสะสมแต้มชั่วคราว (6 หลัก)
                      </span>
                      <span className="text-3xl font-extrabold text-[#FF7DA0] tracking-wider font-mono">
                        {formatOtp(profile.otpCode)}
                      </span>
                      <p className="text-[9px] text-slate-400 font-semibold leading-normal">
                        มีอายุ 5 นาที • บอกรหัสนี้กับร้านค้าเมื่อไม่มีกล้องสำหรับสแกน
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. Announcement Board Card */}
            {announcement && (
              <div className="bg-[#FFFFFF] border border-pink-100/50 p-5 rounded-3xl shadow-sm text-left space-y-2 animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-[#FF7DA0]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#FF7DA0] flex items-center gap-1.5">
                  📢 ประกาศข่าวสารร้านค้า
                </h3>
                <p className="text-xs text-slate-650 leading-relaxed font-medium whitespace-pre-wrap pl-1">
                  {announcement}
                </p>
              </div>
            )}

            {/* 3. Dynamic Rewards List Card */}
            <div className="bg-[#FFFFFF] border border-pink-100/50 p-5 rounded-3xl shadow-sm text-left space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-450 flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-[#FF7DA0]" />
                รายการของรางวัลสำหรับแลกคะแนน
              </h3>

              {rewards.filter((r) => r.isActive !== false).length > 0 ? (
                <div className="space-y-3">
                  {rewards
                    .filter((r) => r.isActive !== false)
                    .map((reward) => {
                    const totalUserPoints = (profile?.currentPoints ?? 0) + (profile?.pendingPoints ?? 0);
                    const canRedeem = totalUserPoints >= reward.points;
                    const hasAlreadyRedeemed = profile?.redeemedRewardIds?.includes(reward.id) ?? false;

                    let buttonText = "กดรับรางวัล";
                    let buttonClass = "bg-emerald-500 hover:bg-[#10b981]/90 text-white shadow-sm hover:scale-[1.02]";
                    let isButtonDisabled = !canRedeem || generatingRedeem;

                    if (hasAlreadyRedeemed) {
                      buttonText = "แลกรับของรางวัลนี้แล้ว";
                      buttonClass = "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50";
                      isButtonDisabled = true;
                    } else if (!canRedeem) {
                      buttonText = "คะแนนสะสมไม่พอ";
                      buttonClass = "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/50";
                      isButtonDisabled = true;
                    }

                    return (
                      <div 
                        key={reward.id} 
                        className="p-3 bg-[#FCF8F9] border border-pink-100/20 rounded-2xl flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <span className="font-bold text-slate-700">{reward.name}</span>
                          <span className="block text-[10px] text-slate-500 font-semibold">
                            ใช้ {reward.points} คะแนน
                          </span>
                        </div>

                        <button
                          disabled={isButtonDisabled}
                          onClick={() => handleGenerateRedeemQR(reward)}
                          className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 ${buttonClass}`}
                        >
                          {generatingRedeem && selectedReward?.id === reward.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <QrCode className="w-3.5 h-3.5" />
                          )}
                          {buttonText}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-center">
                  <p className="text-xs text-slate-400 font-semibold">ยังไม่มีของรางวัลในระบบขณะนี้ 🐾</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* LINE Native QR Scan Button */}
        {!redeemQrUrl && (
          <button
            onClick={startScanner}
            disabled={scanning}
            className="w-full py-4 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl font-bold shadow-sm flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
          >
            {scanning ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Camera className="w-5 h-5" />
            )}
            {scanning ? "กำลังเปิดกล้อง LINE..." : "สแกน QR ร้านค้า เพื่อรับแต้ม"}
          </button>
        )}



        {/* Footer Link: Apply Staff Role */}
        <div className="flex justify-center pt-2">
          <button 
            onClick={() => {
              setStaffName("");
              setSecretCode("");
              setApplyError(null);
              setShowApplyModal(true);
            }}
            className="text-xs text-slate-400 hover:text-[#FF7DA0] underline font-semibold transition-all cursor-pointer"
          >
            สมัครเป็นพนักงานร้านค้าที่นี่
          </button>
        </div>
      </div>

      {/* =================================================================
         STAFF APPLICATION MODAL DIALOG
         ================================================================= */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-[#3D3839]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-pink-100/50 w-full max-w-sm rounded-3xl p-6 shadow-xl relative animate-scale-up text-left">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5 mb-4">
              <Users className="w-5 h-5 text-[#FF7DA0]" />
              สมัครเป็นพนักงานร้านค้า
            </h3>

            {applyError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-red-600 text-xs animate-shake leading-relaxed">
                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{applyError}</span>
              </div>
            )}

            <form onSubmit={handleApplyStaff} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  ชื่อแสดงผลพนักงาน (เช่น พี่ส้ม, น้องเจี๊ยบ)
                </label>
                <input
                  type="text"
                  required
                  placeholder="ป้อนชื่อเล่น หรือชื่อจริงของคุณ"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F9F9] border border-pink-100 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  รหัสผ่านลับพนักงาน (Secret Code)
                </label>
                <input
                  type="password"
                  required
                  placeholder="รหัส 4 หลักสำหรับตรวจสอบสิทธิ์"
                  value={secretCode}
                  onChange={(e) => setSecretCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#F9F9F9] border border-pink-100 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(false)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={applyingStaff}
                  className="flex-1 py-3 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96] flex items-center justify-center gap-1.5"
                >
                  {applyingStaff && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  ส่งคำขอสมัคร
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Custom floating Toast notification */}
      {toast.type && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold text-white border animate-toast-in ${
          toast.type === "success" 
            ? "bg-emerald-500 border-emerald-400 shadow-emerald-500/10" 
            : "bg-red-500 border-red-400 shadow-red-500/10"
        }`}>
          {toast.type === "success" ? <CheckCircle className="w-4 h-4 text-white" /> : <XCircle className="w-4 h-4 text-white" />}
          <span>{toast.message}</span>
        </div>
      )}
    </main>
  );
}
