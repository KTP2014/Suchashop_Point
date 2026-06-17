"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { 
  Award, Loader2, Sparkles, LogOut, Camera, XCircle, 
  CheckCircle2, RefreshCw, Smartphone, TrendingUp, Gift, Send,
  QrCode, Copy, Check
} from "lucide-react";

interface ProfileData {
  currentPoints: number;
  pendingPoints: number;
  totalPoints: number;
}

export default function CustomerDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingSession, setSyncingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  // LIFF State
  const [liffInstance, setLiffInstance] = useState<any>(null);

  // Manual Input State (For Camera-less testing)
  const [manualToken, setManualToken] = useState("");
  const [claimingManual, setClaimingManual] = useState(false);

  // Redemption QR Code State
  const [activeRedeemToken, setActiveRedeemToken] = useState<string | null>(null);
  const [redeemQrUrl, setRedeemQrUrl] = useState<string | null>(null);
  const [redeemTtl, setRedeemTtl] = useState(0);
  const [generatingRedeem, setGeneratingRedeem] = useState(false);
  const [copiedRedeem, setCopiedRedeem] = useState(false);

  // Scanning UI triggers
  const [scanning, setScanning] = useState(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/customer/profile");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/");
          return;
        }
        throw new Error("Failed to load point balances.");
      }
      const data = await res.json();
      if (data.success) {
        setProfile({
          currentPoints: data.currentPoints,
          pendingPoints: data.pendingPoints,
          totalPoints: data.totalPoints,
        });
      }
    } catch (err: any) {
      setError(err.message || "Unable to sync point balances.");
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
        throw new Error(data.message || "Failed to generate redemption coupon.");
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
      setError(err.message || "Unable to request redemption coupon.");
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
        // High priority alert to determine if decoding succeeded before API submission
        alert("สแกนติดแล้ว! (QR Code Detected):\n" + decodedText);

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
      setError("การสแกนโค้ดด้วย LINE ล้มเหลว หรือสิทธิ์กล้องถูกปฏิเสธ");
    } finally {
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    setScanning(false);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    setClaimingManual(true);
    await processScannedToken(manualToken.trim());
    setManualToken("");
    setClaimingManual(false);
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
        throw new Error(data.message || "Points claim declined.");
      }

      setScanResultMsg(`✅ Claimed +${data.addedPoints} points successfully!`);
      await fetchProfile();
    } catch (err: any) {
      setError(err.message || "Failed to claim points.");
    } finally {
      setLoading(false);
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

  const currentPoints = profile?.currentPoints ?? 0;
  const pendingPoints = profile?.pendingPoints ?? 0;
  const progressPercent = (currentPoints / 5) * 100;

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
            <span className="font-bold text-sm tracking-tight text-[#5C5556]">Customer Portal</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-450 hover:text-[#FF7DA0] bg-[#F9F9F9] border border-pink-100/30 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Global Feedback Banners */}
        {(successMsg || scanResultMsg) && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-start gap-3 text-xs animate-fade-in relative shadow-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            <span>{successMsg || scanResultMsg}</span>
            <button 
              onClick={() => { setSuccessMsg(null); setScanResultMsg(null); }}
              className="absolute top-2 right-2 text-emerald-450 hover:text-emerald-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-2xl flex items-start gap-3 text-xs animate-shake relative shadow-sm">
            <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
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
              Reward Redemption Coupon
            </h3>
            
            <div className="p-3 bg-[#F9F9F9] border border-pink-100/30 rounded-2xl shadow-inner">
              <img src={redeemQrUrl} alt="Active redemption coupon QR Code" className="w-52 h-52 rounded-xl" />
            </div>

            <div className="text-center">
              <p className="text-[10px] text-slate-400">Show this QR to the Merchant. Coupon expires in:</p>
              <p className="text-md font-bold text-[#FF7DA0] mt-0.5">
                {Math.floor(redeemTtl / 60)}:{(redeemTtl % 60).toString().padStart(2, "0")}
              </p>
            </div>

            {/* Developer testing copier */}
            <div className="w-full bg-[#F9F9F9] border border-pink-100/30 p-2.5 rounded-xl space-y-1.5 text-[10px] text-left">
              <span className="text-slate-450 block font-bold uppercase tracking-wider">Coupon Token (Camera-less Test)</span>
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
                      <span className="text-emerald-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy</span>
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
              Close / Cancel Coupon
            </button>
          </div>
        ) : (
          /* Main Point circular progress card */
          <div className="bg-[#FFFFFF] border border-pink-100/50 p-8 rounded-3xl shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
            
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-[#F9F9F9] border border-pink-100/30 rounded-xl text-xs text-slate-450 hover:text-[#5C5556] cursor-pointer" onClick={fetchProfile}>
              <RefreshCw className="w-3.5 h-3.5" />
              Sync
            </div>

            <h2 className="text-xs font-bold uppercase tracking-wider text-[#5C5556] mb-6">
              Active Points
            </h2>

            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="88"
                  cy="88"
                  r="74"
                  className="stroke-[#F9F9F9] fill-none"
                  strokeWidth="12"
                />
                <circle
                  cx="88"
                  cy="88"
                  r="74"
                  className="stroke-[#FF7DA0] fill-none transition-all duration-700 ease-out"
                  strokeWidth="12"
                  strokeDasharray={464}
                  strokeDashoffset={464 - (464 * progressPercent) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-extrabold text-[#5C5556] tracking-tight">
                  {currentPoints}
                </span>
                <span className="text-xs text-slate-400 mt-1 font-semibold">
                  out of 5
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-pink-100/30">
              <div className="flex flex-col items-center border-r border-pink-100/30">
                <span className="text-xs text-slate-450 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-[#FF7DA0]" />
                  Overflow
                </span>
                <span className="text-lg font-bold text-[#5C5556] mt-1">
                  {pendingPoints} pts
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-slate-455 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-[#FF7DA0]" />
                  Total Saved
                </span>
                <span className="text-lg font-bold text-[#5C5556] mt-1">
                  {profile?.totalPoints ?? 0} pts
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Generate Redemption Coupon trigger button */}
        {!redeemQrUrl && currentPoints === 5 && (
          <button
            onClick={handleGenerateRedeemQR}
            disabled={generatingRedeem}
            className="w-full py-4 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98]"
          >
            {generatingRedeem ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <QrCode className="w-5 h-5 animate-pulse" />
                Generate Redeem QR Coupon
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
            {scanning ? "กำลังเปิดกล้อง LINE..." : "Scan Merchant QR"}
          </button>
        )}

        {/* TEXT INPUT FALLBACK */}
        {!redeemQrUrl && (
          <div className="bg-[#FFFFFF] border border-pink-100/50 p-5 rounded-2xl space-y-3 shadow-sm">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#5C5556] block">
              Camera-less Testing Tool (Manually Claim Points)
            </label>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste 64-char Hex Earn Token here..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#F9F9F9] border border-pink-100/30 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all"
              />
              <button
                type="submit"
                disabled={claimingManual || !manualToken.trim()}
                className="px-3.5 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default flex items-center justify-center transition-all"
              >
                {claimingManual ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
            <p className="text-[9px] text-slate-400 leading-normal pl-0.5">
              Copy the 64-character token displayed under the QR code on the Merchant Dashboard and paste it here to simulate a scan.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
