"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
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
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
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

  const qrScannerRef = useRef<Html5Qrcode | null>(null);

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
    fetchProfile();
    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(console.error);
      }
    };
  }, []);

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
    setScanning(true);
    setScanResultMsg(null);
    setError(null);

    setTimeout(async () => {
      try {
        if (qrScannerRef.current) {
          if (qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
          }
          qrScannerRef.current = null;
        }

        const html5QrCode = new Html5Qrcode("reader-container");
        qrScannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const minEdge = Math.min(width, height);
              const size = Math.floor(minEdge * 0.7);
              return { width: size, height: size };
            },
          },
          async (decodedText) => {
            let targetToken = decodedText;
            try {
              const parsed = JSON.parse(decodedText);
              if (parsed.token) targetToken = parsed.token;
            } catch (e) {
              // Raw text fallback
            }
            await stopScanner();
            await processScannedToken(targetToken);
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Scanner failed to start:", err);
        setError("กล้องมีปัญหา หรือกำลังใช้งานโดยแอปพลิเคชันอื่นอยู่");
        setScanning(false);
      }
    }, 150);
  };

  const stopScanner = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error(err);
      }
    }
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

  if (loading && !profile) {
    return (
      <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Syncing point balances...</p>
      </div>
    );
  }

  const currentPoints = profile?.currentPoints ?? 0;
  const pendingPoints = profile?.pendingPoints ?? 0;
  const progressPercent = (currentPoints / 5) * 100;

  return (
    <main className="min-h-screen bg-[#090a0f] text-slate-100 p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-950/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-950/10 blur-[120px] pointer-events-none" />

      <div className="max-w-md mx-auto relative z-10 space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-200">Customer Portal</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-950/40 border border-slate-800/60 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Global Feedback Banners */}
        {(successMsg || scanResultMsg) && (
          <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-start gap-3 text-emerald-300 text-sm animate-fade-in relative">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{successMsg || scanResultMsg}</span>
            <button 
              onClick={() => { setSuccessMsg(null); setScanResultMsg(null); }}
              className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-300 text-sm animate-shake relative">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
            <button 
              onClick={() => setError(null)}
              className="absolute top-2 right-2 text-red-400 hover:text-red-200 text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Redemption Coupon QR Card (Displays when active) */}
        {redeemQrUrl && activeRedeemToken ? (
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl shadow-2xl flex flex-col items-center justify-center space-y-4 animate-fade-in">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 self-start">
              <Gift className="w-4 h-4 text-emerald-400 animate-bounce" />
              Reward Redemption Coupon
            </h3>
            
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner">
              <img src={redeemQrUrl} alt="Active redemption coupon QR Code" className="w-52 h-52 rounded-xl" />
            </div>

            <div className="text-center">
              <p className="text-[10px] text-slate-500">Show this QR to the Merchant. Coupon expires in:</p>
              <p className="text-md font-bold text-amber-400 mt-0.5">
                {Math.floor(redeemTtl / 60)}:{(redeemTtl % 60).toString().padStart(2, "0")}
              </p>
            </div>

            {/* Developer testing copier */}
            <div className="w-full bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl space-y-1.5 text-[10px] text-left">
              <span className="text-slate-500 block font-bold uppercase tracking-wider">Coupon Token (Camera-less Test)</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeRedeemToken}
                  className="flex-1 bg-transparent border-none text-slate-300 font-mono focus:outline-none truncate text-[9px]"
                />
                <button
                  onClick={copyRedeemTokenToClipboard}
                  className="p-1 bg-slate-900 border border-slate-800 hover:text-white rounded text-slate-400 flex items-center gap-1 transition-all cursor-pointer"
                >
                  {copiedRedeem ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
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
              className="w-full py-2 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold cursor-pointer transition-all"
            >
              Close / Cancel Coupon
            </button>
          </div>
        ) : (
          /* Main Point circular progress card */
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-8 rounded-3xl shadow-2xl flex flex-col items-center justify-center relative overflow-hidden">
            
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 bg-slate-950/60 border border-slate-800/60 rounded-xl text-xs text-slate-400 hover:text-slate-200 cursor-pointer" onClick={fetchProfile}>
              <RefreshCw className="w-3.5 h-3.5" />
              Sync
            </div>

            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">
              Active Points
            </h2>

            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="88"
                  cy="88"
                  r="74"
                  className="stroke-slate-950/60 fill-none"
                  strokeWidth="12"
                />
                <circle
                  cx="88"
                  cy="88"
                  r="74"
                  className="stroke-indigo-500 fill-none transition-all duration-700 ease-out"
                  strokeWidth="12"
                  strokeDasharray={464}
                  strokeDashoffset={464 - (464 * progressPercent) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-5xl font-extrabold text-white tracking-tight">
                  {currentPoints}
                </span>
                <span className="text-xs text-slate-500 mt-1 font-semibold">
                  out of 5
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-slate-800/60">
              <div className="flex flex-col items-center border-r border-slate-800/60">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                  Overflow
                </span>
                <span className="text-lg font-bold text-slate-100 mt-1">
                  {pendingPoints} pts
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5 text-violet-400" />
                  Total Saved
                </span>
                <span className="text-lg font-bold text-slate-100 mt-1">
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
            className="w-full py-4.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98] hover:shadow-emerald-600/40"
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

        {/* Camera scanning visual interface toggle */}
        {!redeemQrUrl && (
          scanning ? (
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl shadow-2xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-300">Align QR Code inside Box</span>
                <button
                  onClick={stopScanner}
                  className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-950/60 border border-slate-800/60 rounded-lg cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
              <div id="reader-container" className="w-full aspect-square overflow-hidden rounded-2xl border border-slate-800 bg-black" />
            </div>
          ) : (
            <button
              onClick={startScanner}
              className="w-full py-4.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 active:scale-[0.98] hover:shadow-indigo-600/40"
            >
              <Camera className="w-5 h-5" />
              Scan Merchant QR
            </button>
          )
        )}

        {/* TEXT INPUT FALLBACK */}
        {!redeemQrUrl && (
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-5 rounded-2xl space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
              Camera-less Testing Tool (Manually Claim Points)
            </label>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Paste 64-char Hex Earn Token here..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="flex-1 px-3 py-2 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-650 text-xs transition-all"
              />
              <button
                type="submit"
                disabled={claimingManual || !manualToken.trim()}
                className="px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-default flex items-center justify-center transition-all"
              >
                {claimingManual ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
            <p className="text-[9px] text-slate-600 leading-normal pl-0.5">
              Copy the 64-character token displayed under the QR code on the Merchant Dashboard and paste it here to simulate a scan.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
