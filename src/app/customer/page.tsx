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

  // Scanning UI triggers
  const [scanning, setScanning] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);

  // Apply Staff Modal State
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [applyingStaff, setApplyingStaff] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

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

  const handleGenerateRedeemQR = async () => {
    if (!profile || profile.currentPoints !== 5) return;
    setGeneratingRedeem(true);
    setError(null);
    setSuccessMsg(null);
    setCopiedRedeem(false);

    try {
      const res = await fetch("/api/customer/generate-redeem-qr", {
        method: "POST",
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
        alert("สแกนโค้ดสําเร็จ:\n" + decodedText);

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
      setError("การสแกนโค้ดล้มเหลว หรือไม่ได้รับอนุญาตให้ใช้กล้อง");
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

      setScanResultMsg(`🎉 สะสมแต้มสำเร็จเพิ่มอีก +${data.addedPoints} แต้ม!`);
      await fetchProfile();
    } catch (err: any) {
      setError(err.message || "ไม่สามารถสะสมแต้มจากรหัสนี้ได้");
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
          <div className="bg-[#FFFFFF] border border-pink-100/50 p-6 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#5C5556] flex items-center gap-1.5 self-start">
              <Gift className="w-4 h-4 text-[#FF7DA0] animate-bounce" />
              คูปองแลกรับของรางวัล
            </h3>
            
            <div className="p-3 bg-[#F9F9F9] border border-pink-100/30 rounded-2xl shadow-inner">
              <img src={redeemQrUrl} alt="คูปอง QR Code สำหรับแลกของรางวัล" className="w-52 h-52 rounded-xl" />
            </div>

            <div className="text-center">
              <p className="text-[10px] text-slate-400">ยื่น QR โค้ดนี้ให้พนักงานสแกน คูปองหมดอายุใน:</p>
              <p className="text-md font-bold text-[#FF7DA0] mt-0.5">
                {Math.floor(redeemTtl / 60)}:{(redeemTtl % 60).toString().padStart(2, "0")}
              </p>
            </div>

            {/* Developer testing copier */}
            <div className="w-full bg-[#F9F9F9] border border-pink-100/30 p-2.5 rounded-xl space-y-1.5 text-[10px] text-left">
              <span className="text-slate-450 block font-bold uppercase tracking-wider">รหัสคูปองสำหรับทดสอบ</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeRedeemToken}
                  className="flex-1 bg-transparent border-none text-[#5C5556] font-mono focus:outline-none truncate text-[9px]"
                />
                <button
                  onClick={copyRedeemTokenToClipboard}
                  className="p-1 bg-[#FFFFFF] border border-pink-100/30 hover:text-[#FF7DA0] rounded text-slate-400 flex items-center gap-1 transition-all cursor-pointer"
                >
                  {copiedRedeem ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-500">คัดลอกแล้ว</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>คัดลอก</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setActiveRedeemToken(null);
                setRedeemQrUrl(null);
              }}
              className="w-full py-2 bg-[#F9F9F9] border border-pink-100/30 hover:bg-[#FFE2E6]/30 text-slate-500 hover:text-[#5C5556] rounded-xl text-xs font-semibold cursor-pointer transition-all"
            >
              ยกเลิกคูปอง
            </button>
          </div>
        ) : (
          /* v2.0 Redesigned Cat Stamp Card Dashboard */
          <div className="bg-[#FFFFFF] border border-pink-100/50 p-6 rounded-3xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
            
            <div className="absolute top-4 right-4 flex items-center gap-1 px-2.5 py-1 bg-[#F9F9F9] border border-pink-100/30 rounded-xl text-xs text-slate-400 hover:text-[#5C5556] cursor-pointer transition-all" onClick={fetchProfile}>
              <RefreshCw className="w-3 h-3" />
              รีเฟรช
            </div>

            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5C5556] mb-4 self-start">
              บัตรสะสมแต้มอุ้งเท้าแมว 🐾
            </h2>

            {/* Stamp Card Grid (5-column Cat Paw Stamp Slots) */}
            <div className="w-full bg-[#FCF8F9] border border-pink-100/30 rounded-2xl p-4 flex flex-col items-center space-y-4 mb-4 shadow-inner">
              <div className="grid grid-cols-5 gap-3 w-full max-w-[280px]">
                {[...Array(5)].map((_, i) => (
                  <div 
                    key={i} 
                    className={`aspect-square rounded-xl flex items-center justify-center border transition-all duration-300 ${
                      i < currentPoints 
                        ? "bg-[#FFF0E5]/60 border-pink-200 shadow-sm" 
                        : "bg-white/80 border-slate-100"
                    }`}
                  >
                    <CatPaw active={i < currentPoints} className="w-8 h-8" />
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-500 font-semibold">
                {currentPoints === 5 
                  ? "สะสมแต้มครบแล้ว! กดสร้างคูปองแลกรางวัลได้ทันที 🎉"
                  : `สะสมอีก ${5 - currentPoints} แต้ม เพื่อแลกของรางวัลสุดพิเศษ! 🎁`
                }
              </p>
            </div>

            {/* Summary Statistics Layout */}
            <div className="w-full grid grid-cols-2 gap-4 mt-2 pt-4 border-t border-pink-100/30">
              <div className="flex flex-col items-center border-r border-pink-100/30">
                <span className="text-[10px] text-slate-450 flex items-center gap-1 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5 text-[#FF7DA0]" />
                  แต้มรอเข้าคิว (Overflow)
                </span>
                <span className="text-base font-bold text-[#5C5556] mt-0.5">
                  {pendingPoints} แต้ม
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-slate-450 flex items-center gap-1 font-semibold">
                  <Smartphone className="w-3.5 h-3.5 text-[#FF7DA0]" />
                  แต้มสะสมทั้งหมด
                </span>
                <span className="text-base font-bold text-[#5C5556] mt-0.5">
                  {profile?.totalPoints ?? 0} แต้ม
                </span>
              </div>
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
        )}

        {/* Generate Redemption Coupon Trigger Button with Pulse Animation */}
        {!redeemQrUrl && currentPoints === 5 && (
          <button
            onClick={handleGenerateRedeemQR}
            disabled={generatingRedeem}
            className="w-full py-4 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98] animate-bounce hover:animate-none scale-105 border-2 border-pink-200"
          >
            {generatingRedeem ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <QrCode className="w-5 h-5 animate-pulse" />
                กดสร้างคูปองแลกรางวัลที่นี่!
              </>
            )}
          </button>
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
    </main>
  );
}
