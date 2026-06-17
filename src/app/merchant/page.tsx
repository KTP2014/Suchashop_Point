"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import {
  Award, Loader2, RefreshCw, Smartphone, TrendingUp,
  Gift, ShieldAlert, ArrowLeftRight, Search, ListFilter,
  CheckCircle2, XCircle, Trash2, LogOut, QrCode, Copy, Check, Camera, Send
} from "lucide-react";

interface DashboardStats {
  todayTransactions: number;
  todayCustomers: number;
  todayEarns: number;
  todayRedeems: number;
  todayResets: number;
  fromCache?: boolean;
}

interface TransactionItem {
  id: string;
  customerId: string;
  customerPhoneNumber: string;
  type: "EARN" | "REDEEM" | "RESET" | "ADJUSTMENT";
  currentChange: number;
  pendingChange: number;
  resultingCurrent: number;
  resultingPending: number;
  createdAt: string;
}

export default function MerchantDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [history, setHistory] = useState<TransactionItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Search & Pagination History State
  const [searchPhone, setSearchPhone] = useState("");
  const [actionType, setActionType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // QR Code Generation State (Merchant Earning Points)
  const [pointsToGrant, setPointsToGrant] = useState<number>(1); // Dynamic points delta!
  const [activeQR, setActiveQR] = useState<string | null>(null);
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const [qrTtl, setQrTtl] = useState(0);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [copied, setCopied] = useState(false);

  // Scanning Customer Redemption State
  const [scanningRedeem, setScanningRedeem] = useState(false);
  const [manualRedeemToken, setManualRedeemToken] = useState("");
  const [processingManualRedeem, setProcessingManualRedeem] = useState(false);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/merchant/dashboard");
      if (!res.ok) {
        if (res.status === 401) {
          router.push("/");
          return;
        }
        throw new Error("Failed to load dashboard metrics.");
      }
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchHistory = async (targetPage = page) => {
    setLoadingHistory(true);
    let queryParams = `?page=${targetPage}&limit=5`;
    if (searchPhone.trim()) {
      queryParams += `&searchPhone=${encodeURIComponent(searchPhone.trim())}`;
    }
    if (actionType) {
      queryParams += `&actionType=${actionType}`;
    }

    try {
      const res = await fetch(`/api/merchant/history${queryParams}`);
      if (!res.ok) throw new Error("Failed to sync history ledger.");
      const data = await res.json();
      if (data.success) {
        setHistory(data.transactions);
        setTotalPages(data.pagination.totalPages);
        setPage(data.pagination.page);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchHistory(1);
    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(console.error);
      }
    };
  }, [actionType]);

  useEffect(() => {
    if (qrTtl <= 0) {
      setActiveQR(null);
      setQrBlobUrl(null);
      return;
    }
    const timer = setInterval(() => {
      setQrTtl((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [qrTtl]);

  const handleLogout = () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/");
  };

  const generateEarnQR = async () => {
    setGeneratingQR(true);
    setError(null);
    setSuccess(null);
    setCopied(false);

    try {
      // POST custom points to backend payload
      const res = await fetch("/api/merchant/generate-earn-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: pointsToGrant }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to generate QR token.");
      }

      const rawToken = data.token;
      setActiveQR(rawToken);

      const payloadString = JSON.stringify({ token: rawToken });
      const qrDataUrl = await QRCode.toDataURL(payloadString, {
        width: 300,
        margin: 2,
        color: {
          dark: "#ffffff",
          light: "#020617",
        },
      });

      setQrBlobUrl(qrDataUrl);
      setQrTtl(300); // 5 Minutes
    } catch (err: any) {
      setError(err.message || "Unable to request token.");
    } finally {
      setGeneratingQR(false);
    }
  };

  const copyTokenToClipboard = () => {
    if (!activeQR) return;
    navigator.clipboard.writeText(activeQR);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startRedeemScanner = async () => {
    setScanningRedeem(true);
    setError(null);
    setSuccess(null);

    setTimeout(() => {
      const html5QrCode = new Html5Qrcode("redeem-reader");
      qrScannerRef.current = html5QrCode;

      html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          let targetToken = decodedText;
          try {
            const parsed = JSON.parse(decodedText);
            if (parsed.token) targetToken = parsed.token;
          } catch (e) {
            // Raw text fallback
          }
          await stopRedeemScanner();
          await processRedemptionCoupon(targetToken);
        },
        () => {}
      ).catch((err) => {
        setError("Camera permission denied or camera not found.");
        setScanningRedeem(false);
      });
    }, 100);
  };

  const stopRedeemScanner = async () => {
    if (qrScannerRef.current && qrScannerRef.current.isScanning) {
      try {
        await qrScannerRef.current.stop();
      } catch (err) {
        console.error(err);
      }
    }
    setScanningRedeem(false);
  };

  const handleManualRedeemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRedeemToken.trim()) return;
    setProcessingManualRedeem(true);
    await processRedemptionCoupon(manualRedeemToken.trim());
    setManualRedeemToken("");
    setProcessingManualRedeem(false);
  };

  const processRedemptionCoupon = async (token: string) => {
    setLoadingStats(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/merchant/scan-redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Redemption request failed.");
      }

      setSuccess("🎉 Reward successfully claimed and points reset!");
      await fetchStats();
      await fetchHistory(page);
    } catch (err: any) {
      setError(err.message || "Failed to process redemption.");
    } finally {
      setLoadingStats(false);
    }
  };

  const handleReset = async (customerId: string, customerPhone: string) => {
    const isConfirmed = confirm(
      `⚠️ WARNING!\nAre you sure you want to ADMINISTRATIVE RESET points for customer ${customerPhone}?\nThis will completely wipe all current and pending points to 0. This action is irreversible.`
    );
    if (!isConfirmed) return;

    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/merchant/customer/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Points reset failed.");
      }

      setSuccess(`✅ Points successfully wiped to 0 for customer ${customerPhone}!`);
      await fetchStats();
      await fetchHistory(page);
    } catch (err: any) {
      setError(err.message || "Reset request failed.");
    }
  };

  return (
    <main className="min-h-screen bg-[#090a0f] text-slate-100 p-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-950/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-950/10 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight text-slate-200">Merchant Dashboard</span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-950/40 border border-slate-800/60 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Global Feedback Banners */}
        {success && (
          <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-start gap-3 text-emerald-300 text-sm animate-fade-in relative">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-300 text-sm animate-shake relative">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="absolute top-2 right-2 text-red-400 hover:text-red-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {/* Top Grid: Metrics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Served Today</span>
            <span className="text-2xl font-bold text-slate-100 mt-2">{stats?.todayTransactions ?? 0}</span>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Unique Customer</span>
            <span className="text-2xl font-bold text-slate-100 mt-2">{stats?.todayCustomers ?? 0}</span>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Points Earned</span>
            <span className="text-2xl font-bold text-emerald-400 mt-2">+{stats?.todayEarns ?? 0}</span>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex flex-col justify-between">
            <span className="text-xs font-semibold text-slate-400">Redemptions</span>
            <span className="text-2xl font-bold text-violet-400 mt-2">{stats?.todayRedeems ?? 0}</span>
          </div>
          <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl flex flex-col justify-between col-span-2 md:col-span-1">
            <span className="text-xs font-semibold text-slate-400 flex items-center justify-between">
              Resets
              {stats?.fromCache && <span className="text-[10px] bg-slate-950/60 border border-slate-800 px-1.5 py-0.5 rounded text-slate-500">Cached</span>}
            </span>
            <span className="text-2xl font-bold text-red-400 mt-2">{stats?.todayResets ?? 0}</span>
          </div>
        </div>

        {/* Main Body Split Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: QR Generator & Scanning Coupons */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Dynamic Points QR Generator */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl flex flex-col items-center justify-center space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 self-start">
                <QrCode className="w-4 h-4 text-indigo-400" />
                Dynamic Points Generator
              </h3>

              {/* Point Input selector (1 to 5) */}
              <div className="w-full space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  Select Points to Grant (+{pointsToGrant} Pts)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPointsToGrant(p)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        pointsToGrant === p
                          ? "bg-indigo-600 text-white border border-indigo-500"
                          : "bg-slate-950/60 border border-slate-800/60 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              {qrBlobUrl && activeQR ? (
                <div className="flex flex-col items-center space-y-3 w-full">
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-2xl shadow-inner">
                    <img src={qrBlobUrl} alt="Active points claim QR Code" className="w-44 h-44 rounded-xl" />
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-500">QR Code (+{pointsToGrant} Pts) valid for:</p>
                    <p className="text-md font-bold text-amber-400">
                      {Math.floor(qrTtl / 60)}:{(qrTtl % 60).toString().padStart(2, "0")}
                    </p>
                  </div>
                  
                  {/* DEVELOPER TESTING HELPER */}
                  <div className="w-full bg-slate-950/60 border border-slate-800/80 p-2.5 rounded-xl space-y-1 text-[9px] text-left">
                    <span className="text-slate-500 block font-bold uppercase tracking-wider">Active Token (Copy & Paste to Customer)</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={activeQR}
                        className="flex-1 bg-transparent border-none text-slate-300 font-mono focus:outline-none truncate text-[9px]"
                      />
                      <button
                        onClick={copyTokenToClipboard}
                        className="p-1 bg-slate-900 border border-slate-800 hover:text-white rounded text-slate-400 flex items-center gap-1 transition-all cursor-pointer"
                      >
                        {copied ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center py-6 px-6 border border-dashed border-slate-800 rounded-2xl text-center space-y-2">
                  <QrCode className="w-10 h-10 text-slate-700 stroke-[1.5]" />
                  <p className="text-xs text-slate-500">No active points QR displayed.</p>
                </div>
              )}

              <button
                onClick={generateEarnQR}
                disabled={generatingQR}
                className="w-full py-3.5 bg-gradient-to-r from-indigo-500 via-indigo-600 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98] hover:shadow-indigo-600/40"
              >
                {generatingQR ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Display Dynamic Earn QR"
                )}
              </button>
            </div>

            {/* 2. Customer Coupon Redemption Scanner */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl flex flex-col items-center justify-center space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 self-start">
                <Gift className="w-4 h-4 text-emerald-400 animate-pulse" />
                Redemption Coupon Scanner
              </h3>

              {scanningRedeem ? (
                <div className="w-full space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Scan Customer Redemption Coupon</span>
                    <button
                      onClick={stopRedeemScanner}
                      className="p-1 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded text-slate-400 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div id="redeem-reader" className="w-full aspect-square overflow-hidden rounded-2xl border border-slate-800 bg-black" />
                </div>
              ) : (
                <button
                  onClick={startRedeemScanner}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98] hover:shadow-emerald-600/40"
                >
                  <Camera className="w-4.5 h-4.5" />
                  Scan Customer Coupon
                </button>
              )}

              {/* Developer camera-less redemption tool */}
              {!scanningRedeem && (
                <div className="w-full bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-2 text-left">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-500 block">
                    Camera-less Coupon Tool (Paste Customer Token)
                  </label>
                  <form onSubmit={handleManualRedeemSubmit} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste 64-char Customer Coupon Token..."
                      value={manualRedeemToken}
                      onChange={(e) => setManualRedeemToken(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-slate-950/60 border border-slate-800/80 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-650 text-xs transition-all"
                    />
                    <button
                      type="submit"
                      disabled={processingManualRedeem || !manualRedeemToken.trim()}
                      className="px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center justify-center transition-all"
                    >
                      {processingManualRedeem ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </form>
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Search history & admin reset */}
          <div className="lg:col-span-7 bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl flex flex-col space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 self-start">
              Point History Ledger
            </h3>

            {/* Filter Search bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search customer phone..."
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-500 text-xs transition-all focus:ring-1 focus:ring-indigo-500/20"
                />
              </div>
              <div className="relative">
                <ListFilter className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/40 border border-slate-800/80 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 text-xs transition-all appearance-none cursor-pointer"
                >
                  <option value="">All Types</option>
                  <option value="EARN">EARN</option>
                  <option value="REDEEM">REDEEM</option>
                  <option value="RESET">RESET</option>
                  <option value="ADJUSTMENT">ADJUST</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => fetchHistory(1)}
              className="w-full py-2 bg-slate-950/60 border border-slate-800/60 hover:bg-slate-900 rounded-xl text-xs font-semibold cursor-pointer text-slate-300 transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Search & Filter
            </button>

            {/* History Table List */}
            {loadingHistory ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-4 flex-1">
                {history.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 bg-slate-950/40 border border-slate-800/60 rounded-2xl flex items-center justify-between gap-4 text-xs animate-fade-in"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-200">{tx.customerPhoneNumber}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            tx.type === "EARN"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
                              : tx.type === "REDEEM"
                              ? "bg-violet-950/60 text-violet-400 border border-violet-800"
                              : tx.type === "RESET"
                              ? "bg-red-950/60 text-red-400 border border-red-800"
                              : "bg-slate-900 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(tx.createdAt).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold">
                          {tx.currentChange !== 0 && (
                            <span className={tx.currentChange > 0 ? "text-emerald-400" : "text-red-400"}>
                              {tx.currentChange > 0 ? `+${tx.currentChange}` : tx.currentChange} current
                            </span>
                          )}
                          {tx.pendingChange !== 0 && (
                            <span className={`block text-[10px] ${tx.pendingChange > 0 ? "text-indigo-400" : "text-amber-500"}`}>
                              {tx.pendingChange > 0 ? `+${tx.pendingChange}` : tx.pendingChange} pending
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Result: {tx.resultingCurrent} / {tx.resultingPending} pts
                        </div>
                      </div>

                      {tx.type !== "RESET" && (
                        <button
                          onClick={() => handleReset(tx.customerId, tx.customerPhoneNumber)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-slate-800 rounded-xl transition-all cursor-pointer"
                          title="Administrative Reset Points"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Pagination Indicators */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t border-slate-800/40">
                    <button
                      disabled={page <= 1}
                      onClick={() => fetchHistory(page - 1)}
                      className="px-3.5 py-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Prev
                    </button>
                    <span className="text-slate-500 text-xs">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => fetchHistory(page + 1)}
                      className="px-3.5 py-1.5 bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-2">
                <ArrowLeftRight className="w-10 h-10 text-slate-700 stroke-[1.5]" />
                <p className="text-xs text-slate-500">No point history matching filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
