"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import {
  Award, Loader2, RefreshCw, Smartphone, TrendingUp,
  Gift, ShieldAlert, ArrowLeftRight, Search, ListFilter,
  CheckCircle2, XCircle, Trash2, LogOut, QrCode, Copy, Check, Camera, Send,
  Users, CheckCircle, Sparkles
} from "lucide-react";

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
  customer?: {
    displayName: string | null;
  };
}

interface PendingStaffItem {
  id: string;
  displayName: string | null;
  phoneNumber: string | null;
  lineUserId: string | null;
  createdAt: string;
}

interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  danger?: boolean;
}

export default function MerchantDashboard() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [history, setHistory] = useState<TransactionItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | null }>({ message: "", type: null });
  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ message: msg, type });
    const timer = setTimeout(() => setToast({ message: "", type: null }), 4000);
    return timer;
  };

  // Search & Pagination History State
  const [searchName, setSearchName] = useState("");
  const [actionType, setActionType] = useState<string>("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // QR Code Generation State (Merchant Earning Points)
  const [pointsToGrant, setPointsToGrant] = useState<number>(1);
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

  // OTP Verification State (Camera-less backup)
  const [otpCode, setOtpCode] = useState("");
  const [otpActionType, setOtpActionType] = useState<"EARN" | "REDEEM">("EARN");
  const [otpPoints, setOtpPoints] = useState<number>(1);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Admin Pending Staff State
  const [pendingStaff, setPendingStaff] = useState<PendingStaffItem[]>([]);
  const [loadingPendingStaff, setLoadingPendingStaff] = useState(false);

  // Admin Staff Management List State
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [loadingStaffMembers, setLoadingStaffMembers] = useState(false);

  // Admin God Mode State
  const [godModePoints, setGodModePoints] = useState<number>(1);
  const [processingGodMode, setProcessingGodMode] = useState(false);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const triggerConfirm = (title: string, message: string, onConfirm: () => void, danger = false) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      onConfirm,
      danger,
    });
  };

  const checkUserAccess = async () => {
    try {
      const res = await fetch("/api/customer/profile");
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      if (data.success) {
        if (data.role === "ADMIN" || data.role === "STAFF" || data.role === "MERCHANT") {
          setUserRole(data.role);
          setUserName(data.displayName || "ผู้จัดการ");
          setLoadingUser(false);
          if (data.role === "ADMIN") {
            fetchPendingStaff();
            fetchStaffList();
          }
        } else {
          router.push("/customer");
        }
      }
    } catch (err) {
      router.push("/");
    }
  };

  const fetchPendingStaff = async () => {
    setLoadingPendingStaff(true);
    try {
      const res = await fetch("/api/merchant/pending-staff");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPendingStaff(data.users || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPendingStaff(false);
    }
  };

  const fetchStaffList = async () => {
    setLoadingStaffMembers(true);
    try {
      const res = await fetch("/api/merchant/staff-list");
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStaffMembers(data.users || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch staff list:", err);
    } finally {
      setLoadingStaffMembers(false);
    }
  };

  const handleApproveStaff = async (userId: string, approvedRole: "STAFF" | "ADMIN" | "REJECT", displayName: string) => {
    let actionLabel = "";
    if (approvedRole === "STAFF") actionLabel = "ตั้งค่าเป็นพนักงาน (Staff)";
    if (approvedRole === "ADMIN") actionLabel = "ตั้งค่าเป็นผู้ดูแลระบบ (Admin)";
    if (approvedRole === "REJECT") actionLabel = "ถอดถอนสิทธิ์การใช้งานเป็นลูกค้า";

    triggerConfirm(
      "ยืนยันการทำรายการปรับบทบาทผู้ใช้งาน",
      `คุณต้องการทำการ [${actionLabel}] ให้กับคุณ ${displayName} ใช่หรือไม่?`,
      async () => {
        setError(null);
        setSuccess(null);
        try {
          const res = await fetch("/api/merchant/approve-staff", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, approvedRole }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "การทำรายการปรับบทบาทล้มเหลว");
          }
          setSuccess(`ทำรายการ [${actionLabel}] ให้กับคุณ ${displayName} สำเร็จ!`);
          await fetchPendingStaff();
          await fetchStaffList();
        } catch (err: any) {
          setError(err.message || "เกิดข้อผิดพลาดในการทำรายการปรับบทบาท");
        }
      }
    );
  };

  const fetchHistory = async (targetPage = page) => {
    setLoadingHistory(true);
    let queryParams = `?page=${targetPage}&limit=6`;
    if (searchName.trim()) {
      queryParams += `&searchName=${encodeURIComponent(searchName.trim())}`;
    }
    if (actionType) {
      queryParams += `&actionType=${actionType}`;
    }

    try {
      const res = await fetch(`/api/merchant/history${queryParams}`);
      if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลประวัติการทำรายการได้");
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
    checkUserAccess();
    fetchHistory(1);
    return () => {
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(console.error);
      }
    };
  }, [actionType]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (userRole) { // Only fetch if user session is loaded
        fetchHistory(1);
      }
    }, 450);
    return () => clearTimeout(delayDebounce);
  }, [searchName]);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

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
      const res = await fetch("/api/merchant/generate-earn-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points: pointsToGrant }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "ไม่สามารถสร้างโทเค็น QR ได้");
      }

      const rawToken = data.token;
      setActiveQR(rawToken);

      const payloadString = JSON.stringify({ token: rawToken });
      const qrDataUrl = await QRCode.toDataURL(payloadString, {
        width: 300,
        margin: 2,
        color: {
          dark: "#3D3839", // Standard dark charcoal foreground
          light: "#FFFFFF", // Standard high-contrast white background
        },
      });

      setQrBlobUrl(qrDataUrl);
      setQrTtl(300); // 5 Minutes
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการสร้าง QR สะสมแต้ม");
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

    setTimeout(async () => {
      try {
        if (qrScannerRef.current) {
          if (qrScannerRef.current.isScanning) {
            await qrScannerRef.current.stop();
          }
          qrScannerRef.current = null;
        }

        const html5QrCode = new Html5Qrcode("redeem-reader");
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
            await stopRedeemScanner();
            await processRedemptionCoupon(targetToken);
          },
          () => {}
        );
      } catch (err: any) {
        console.error("Redeem scanner failed to start:", err);
        setError("กล้องมีปัญหา หรือกำลังใช้งานโดยแอปพลิเคชันอื่นอยู่");
        setScanningRedeem(false);
      }
    }, 150);
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
        throw new Error(data.message || "การแลกของรางวัลล้มเหลว");
      }

      setSuccess("🎉 แลกรางวัลคูปองและหักแต้มเรียบร้อยแล้ว!");
      await fetchHistory(page);
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการประมวลผลคูปองแลกรางวัล");
    }
  };

  // v2.0 Verify Customer OTP backup
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6 || !/^[0-9]+$/.test(otpCode)) {
      setError("กรุณากรอกรหัส OTP เป็นตัวเลข 6 หลัก");
      return;
    }

    const actionLabel = otpActionType === "EARN" ? `สะสมแต้มจำนวน +${otpPoints} แต้ม` : "แลกรับของรางวัลและล้างแต้ม";
    triggerConfirm(
      "ยืนยันการทำรายการผ่าน OTP",
      `คุณต้องการทำรายการ [${actionLabel}] สำหรับรหัส OTP: ${otpCode} ใช่หรือไม่?`,
      async () => {
        setVerifyingOtp(true);
        setError(null);
        setSuccess(null);

        try {
          const res = await fetch("/api/merchant/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              otpCode,
              actionType: otpActionType,
              points: otpActionType === "EARN" ? otpPoints : undefined,
            }),
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.message || "การตรวจสอบสิทธิ์รหัส OTP ล้มเหลว");
          }

          setSuccess(`ทำรายการสำเร็จ: ${data.message}`);
          setOtpCode("");
          await fetchHistory(page);
        } catch (err: any) {
          setError(err.message || "เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP");
        } finally {
          setVerifyingOtp(false);
        }
      }
    );
  };

  // Admin God Mode: Reset all customers
  const handleAdminResetAll = () => {
    triggerConfirm(
      "⚠️ คำเตือน: รีเซ็ตแต้มลูกค้าทุกคน!",
      "คุณต้องการล้างแต้ม (รีเซ็ตแต้มสะสมทั้งหมดและแต้มคิวส่วนเกิน) ของลูกค้าทุกคนในระบบให้เป็น 0 แต้ม ใช่หรือไม่? การทำรายการนี้จะไม่สามารถย้อนกลับได้!",
      async () => {
        setProcessingGodMode(true);
        setError(null);
        setSuccess(null);
        try {
          const res = await fetch("/api/merchant/admin/reset-all", {
            method: "POST",
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "การรีเซ็ตแต้มลูกค้าทุกคนล้มเหลว");
          }
          setSuccess(`ล้างแต้มลูกค้าทั้งหมดสำเร็จ (${data.count} บัญชี)`);
          await fetchHistory(page);
        } catch (err: any) {
          setError(err.message || "เกิดข้อผิดพลาดในการรีเซ็ตแต้ม");
        } finally {
          setProcessingGodMode(false);
        }
      },
      true
    );
  };

  // Admin God Mode: Grant points to everyone
  const handleAdminAddPointsAll = () => {
    triggerConfirm(
      "ยืนยันการเพิ่มแต้มแจกทุกคน",
      `คุณต้องการเพิ่มแต้มสะสม (+${godModePoints} แต้ม) ให้กับลูกค้าทุกคนในระบบใช่หรือไม่? สำหรับคนที่มีแต้มเกินจะถูกเก็บไว้ที่แต้มรอคิว (Overflow)`,
      async () => {
        setProcessingGodMode(true);
        setError(null);
        setSuccess(null);
        try {
          const res = await fetch("/api/merchant/admin/add-point-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: godModePoints }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "การเพิ่มแต้มแจกลูกค้าทุกคนล้มเหลว");
          }
          setSuccess(`แจกแต้มให้ลูกค้าทุกคนสำเร็จ (+${godModePoints} แต้ม, ${data.count} บัญชี)`);
          await fetchHistory(page);
        } catch (err: any) {
          setError(err.message || "เกิดข้อผิดพลาดในการแจกแต้ม");
        } finally {
          setProcessingGodMode(false);
        }
      }
    );
  };

  // Single customer manual point wipe
  const handleResetSingleCustomer = (customerId: string, customerPhone: string) => {
    triggerConfirm(
      "⚠️ ล้างแต้มลูกค้ารายบุคคล!",
      `คุณต้องการรีเซ็ตแต้มสะสมทั้งหมดของเบอร์โทร ${customerPhone} ให้เป็น 0 ใช่หรือไม่?`,
      async () => {
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
            throw new Error(data.message || "การรีเซ็ตแต้มลูกค้าคนนี้ล้มเหลว");
          }
          setSuccess(`ล้างแต้มของคุณ ${customerPhone} สำเร็จ!`);
          await fetchHistory(page);
        } catch (err: any) {
          setError(err.message || "เกิดข้อผิดพลาดในการล้างแต้มลูกค้า");
        }
      },
      true
    );
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#090a0f] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400 font-semibold">กำลังตรวจสอบสิทธิ์การใช้งาน...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#090a0f] text-slate-100 p-6 relative overflow-hidden font-sans select-none">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-950/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-950/10 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-4 rounded-2xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm tracking-tight text-slate-200">Sucha Shop ระบบหลังร้าน</span>
              <span className="text-[9px] text-slate-400">
                พนักงาน: {userName} • สิทธิ์: {userRole === "ADMIN" ? "ผู้ดูแลระบบ (Admin)" : "พนักงานร้าน (Staff)"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/customer?test=true")}
              className="px-3.5 py-2 text-xs font-bold text-slate-350 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 rounded-xl transition-all cursor-pointer"
            >
              หน้าลูกค้า (Test)
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-250 bg-slate-950/40 border border-slate-800/60 rounded-xl transition-all cursor-pointer animate-pulse"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {success && (
          <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex items-start gap-3 text-emerald-300 text-sm animate-fade-in relative text-left">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div className="flex-1">
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="absolute top-2 right-2 text-emerald-400 hover:text-emerald-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-2xl flex items-start gap-3 text-red-300 text-sm animate-shake relative text-left">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
            <div className="flex-1">
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="absolute top-2 right-2 text-red-400 hover:text-red-200 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {/* Main Body Split Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: QR Generator & Scanning Coupons & OTP Verify */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Dynamic Points QR Generator */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-5 rounded-3xl flex flex-col items-center justify-center space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 self-start">
                <QrCode className="w-4 h-4 text-indigo-400" />
                เครื่องสร้าง QR สะสมแต้ม
              </h3>

              {/* Point Input selector (1 to 5) */}
              <div className="w-full space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                  ระบุจำนวนแต้มสะสม (+{pointsToGrant} แต้ม)
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPointsToGrant(p)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        pointsToGrant === p
                          ? "bg-indigo-650 text-white border border-indigo-500 shadow-md shadow-indigo-600/10"
                          : "bg-slate-950/60 border border-slate-850 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              {qrBlobUrl && activeQR ? (
                <div className="flex flex-col items-center space-y-3 w-full animate-fade-in">
                  <div className="p-2.5 bg-slate-950 border border-slate-850 rounded-2xl shadow-inner">
                    <img src={qrBlobUrl} alt="คิวอาร์โค้ดสำหรับสะสมแต้ม" className="w-44 h-44 rounded-xl" />
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-500">QR Code (+{pointsToGrant} แต้ม) จะหมดอายุใน:</p>
                    <p className="text-md font-bold text-amber-400 font-mono">
                      {Math.floor(qrTtl / 60)}:{(qrTtl % 60).toString().padStart(2, "0")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center py-6 px-6 border border-dashed border-slate-800 rounded-2xl text-center space-y-2">
                  <QrCode className="w-10 h-10 text-slate-700 stroke-[1.5]" />
                  <p className="text-xs text-slate-500">ยังไม่มีการสร้าง QR สะสมแต้ม</p>
                </div>
              )}

              <button
                onClick={generateEarnQR}
                disabled={generatingQR}
                className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white rounded-2xl font-bold shadow-lg shadow-indigo-600/10 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98]"
              >
                {generatingQR ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "แสดง QR สะสมแต้ม"
                )}
              </button>
            </div>

            {/* 2. Customer Coupon Redemption Scanner */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-5 rounded-3xl flex flex-col items-center justify-center space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 self-start">
                <Gift className="w-4 h-4 text-emerald-400" />
                สแกนคูปองแลกรางวัลลูกค้า
              </h3>

              {scanningRedeem ? (
                <div className="w-full space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">สแกนคูปอง QR โค้ดของลูกค้า</span>
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
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl font-bold shadow-lg shadow-emerald-600/10 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98]"
                >
                  <Camera className="w-4.5 h-4.5" />
                  เปิดกล้องสแกนคูปองลูกค้า
                </button>
              )}

            </div>

            {/* 3. Camera-less OTP Backup Verification Form */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-5 rounded-3xl flex flex-col space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#FF7DA0]" />
                ระบบสะสมแต้มผ่านรหัส OTP (กล้องเสีย/ไม่มีกล้อง)
              </h3>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    รหัส OTP 6 หลักของลูกค้า
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="ตัวอย่าง 123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                    className="w-full px-3.5 py-2.5 bg-slate-950/60 border border-slate-800/80 rounded-2xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-600 text-sm tracking-widest font-bold text-center transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOtpActionType("EARN")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      otpActionType === "EARN"
                        ? "bg-indigo-650 text-white border-indigo-500"
                        : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    สะสมแต้ม (Earn)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpActionType("REDEEM")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      otpActionType === "REDEEM"
                        ? "bg-emerald-650 text-white border-emerald-500"
                        : "bg-slate-950/60 border-slate-850 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    แลกรางวัล (Redeem)
                  </button>
                </div>

                {otpActionType === "EARN" && (
                  <div className="space-y-2 animate-fade-in text-left">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                      จำนวนแต้มที่สะสมผ่าน OTP (+{otpPoints} แต้ม)
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setOtpPoints(p)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            otpPoints === p
                              ? "bg-indigo-600 text-white border border-indigo-500"
                              : "bg-slate-950/40 border border-slate-800/60 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          +{p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifyingOtp || otpCode.length !== 6}
                  className="w-full py-3.5 bg-gradient-to-r from-[#FF7DA0] to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white rounded-2xl font-bold shadow-lg shadow-pink-600/10 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {verifyingOtp ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "ตรวจสอบและยืนยันรหัส OTP"
                  )}
                </button>
              </form>
            </div>

          </div>

          {/* Right Column: Ledger Log & Admin Control Center */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* ADMIN CONTROL PANEL: (Approvals & God Mode) */}
            {userRole === "ADMIN" && (
              <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-6 rounded-3xl space-y-6 text-left">
                <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
                  <Users className="w-5 h-5 text-amber-500 animate-pulse" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-400">
                    แผงควบคุมระบบ (Admin Console)
                  </h3>
                </div>

                {/* A. Pending Staff Approvals Panel */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-350">
                    คำขออนุมัติสิทธิ์พนักงานร้าน
                  </h4>
                  
                  {loadingPendingStaff ? (
                    <div className="py-4 text-center">
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin mx-auto" />
                    </div>
                  ) : pendingStaff.length > 0 ? (
                    <div className="space-y-3">
                      {pendingStaff.map((staff) => (
                        <div 
                          key={staff.id} 
                          className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-slate-200">
                              {staff.displayName || "ไม่ระบุชื่อ"}
                            </div>
                            <div className="text-[10px] text-slate-500 leading-normal">
                              เบอร์: {staff.phoneNumber || "ไม่มี"} • LINE: {staff.lineUserId ? staff.lineUserId.slice(0, 10) + "..." : "ไม่มี"}
                            </div>
                          </div>

                          <div className="flex gap-1.5 self-end sm:self-center">
                            <button
                              onClick={() => handleApproveStaff(staff.id, "STAFF", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              พนักงาน (Staff)
                            </button>
                            <button
                              onClick={() => handleApproveStaff(staff.id, "ADMIN", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              แอดมิน (Admin)
                            </button>
                            <button
                              onClick={() => handleApproveStaff(staff.id, "REJECT", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/60 border border-red-500/30 text-red-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              ปฏิเสธ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950/20 border border-dashed border-slate-850 rounded-2xl text-center">
                      <p className="text-xs text-slate-500">ไม่มีคำขอสิทธิ์พนักงานที่ค้างอนุมัติ 🐾</p>
                    </div>
                  )}
                </div>

                {/* B. Staff Management Panel */}
                <div className="pt-4 border-t border-slate-850 space-y-3">
                  <h4 className="text-xs font-bold text-slate-350">
                    รายชื่อพนักงานในระบบทั้งหมด
                  </h4>

                  {loadingStaffMembers ? (
                    <div className="py-4 text-center">
                      <Loader2 className="w-5 h-5 text-amber-500 animate-spin mx-auto" />
                    </div>
                  ) : staffMembers.length > 0 ? (
                    <div className="space-y-3">
                      {staffMembers.map((staff) => (
                        <div 
                          key={staff.id} 
                          className="p-4 bg-slate-950/60 border border-slate-850 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-slate-200 flex items-center gap-1.5">
                              {staff.displayName || "ไม่ระบุชื่อ"}
                              {staff.role === "ADMIN" ? (
                                <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-[9px] font-bold">
                                  ADMIN
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-bold">
                                  STAFF
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 leading-normal">
                              เบอร์โทร: {staff.phoneNumber || "ไม่มี"}
                            </div>
                          </div>

                          <div className="flex gap-1.5 self-end sm:self-center">
                            {staff.role === "STAFF" && (
                              <button
                                onClick={() => handleApproveStaff(staff.id, "ADMIN", staff.displayName || "ไม่ระบุชื่อ")}
                                className="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                              >
                                แต่งตั้งเป็น Admin
                              </button>
                            )}
                            {staff.role === "ADMIN" && (
                              <button
                                onClick={() => handleApproveStaff(staff.id, "STAFF", staff.displayName || "ไม่ระบุชื่อ")}
                                className="px-2.5 py-1.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/30 text-indigo-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                              >
                                ลดระดับเป็น Staff
                              </button>
                            )}
                            <button
                              onClick={() => handleApproveStaff(staff.id, "REJECT", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900/60 border border-red-500/30 text-red-300 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              ถอดสิทธิ์พนักงาน
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-950/20 border border-dashed border-slate-850 rounded-2xl text-center">
                      <p className="text-xs text-slate-500">ไม่มีพนักงานในระบบ 🐾</p>
                    </div>
                  )}
                </div>

                {/* C. Admin God Mode Actions */}
                <div className="pt-5 border-t border-slate-850 space-y-4">
                  <div className="flex items-center gap-1.5 text-rose-450">
                    <ShieldAlert className="w-4 h-4 text-rose-500 animate-pulse" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">
                      โหมดผู้ดูแลระบบสูงสุด (God Mode)
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Add point to all customers card */}
                    <div className="p-4 bg-slate-950/50 border border-slate-850 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-800 transition-all">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                          เพิ่มแต้มแจกทุกคน
                        </span>
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          เพิ่มจำนวนแต้ม (+1 ถึง +5) ให้กับลูกค้า พนักงาน และแอดมินทุกคนในระบบพร้อมกัน
                        </p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <div className="relative flex-shrink-0">
                          <select
                            value={godModePoints}
                            onChange={(e) => setGodModePoints(Number(e.target.value))}
                            className="h-10 px-3 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-200 text-xs cursor-pointer appearance-none text-center font-bold font-mono min-w-[70px]"
                          >
                            {[1, 2, 3, 4, 5].map((v) => (
                              <option key={v} value={v}>+{v}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={handleAdminAddPointsAll}
                          disabled={processingGodMode}
                          className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96] flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/10"
                        >
                          {processingGodMode ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                          แจกทุกคน
                        </button>
                      </div>
                    </div>

                    {/* Reset points for all customers card */}
                    <div className="p-4 bg-slate-950/50 border border-slate-850 rounded-2xl flex flex-col justify-between space-y-4 hover:border-slate-800 transition-all">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-rose-450 uppercase tracking-wider block">
                          ล้างแต้มทุกคนเป็น 0
                        </span>
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          ⚠️ เคลียร์แต้มสะสมทั้งหมดของทุกคนให้กลายเป็นศูนย์ (ไม่สามารถเรียกคืนประวัติแต้มเดิมได้)
                        </p>
                      </div>

                      <button
                        onClick={handleAdminResetAll}
                        disabled={processingGodMode}
                        className="w-full h-10 bg-rose-650 hover:bg-rose-750 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96] flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/10"
                      >
                        {processingGodMode ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        ล้างแต้มลูกค้าทุกคน
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Point History Ledger Log */}
            <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800/60 p-5 rounded-3xl flex flex-col space-y-4 text-left">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">
                  ประวัติธุรกรรมแต้มสะสม
                </h3>
                <button
                  onClick={() => fetchHistory(1)}
                  className="p-1.5 hover:bg-slate-800/80 border border-slate-850 rounded-xl text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter Search bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <Search className="w-4 h-4 text-slate-555 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อเล่นหรือชื่อไลน์ลูกค้า..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-950/40 border border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 placeholder-slate-550 text-xs transition-all focus:ring-1 focus:ring-indigo-500/20 font-semibold"
                  />
                </div>
                <div className="relative">
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950/40 border border-slate-850 rounded-xl focus:outline-none focus:border-indigo-500 text-slate-100 text-xs transition-all cursor-pointer appearance-none font-semibold text-center"
                  >
                    <option value="">ทุกประเภท</option>
                    <option value="EARN">สะสมแต้ม (EARN)</option>
                    <option value="REDEEM">แลกของรางวัล (REDEEM)</option>
                    <option value="RESET">ล้างแต้มทั้งหมด (RESET)</option>
                  </select>
                </div>
              </div>

              {/* History Table List */}
              {loadingHistory ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                </div>
              ) : history.length > 0 ? (
                <div className="space-y-3 flex-1">
                  {history.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-4 bg-slate-950/40 border border-slate-850 rounded-2xl flex items-center justify-between gap-3 text-xs animate-fade-in"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200">
                            {tx.customer?.displayName || tx.customerPhoneNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
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

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bold">
                            {tx.currentChange !== 0 && (
                              <span className={tx.currentChange > 0 ? "text-emerald-400" : "text-red-400"}>
                                {tx.currentChange > 0 ? `+${tx.currentChange}` : tx.currentChange} แต้มปกติ
                              </span>
                            )}
                            {tx.pendingChange !== 0 && (
                              <span className={`block text-[10px] ${tx.pendingChange > 0 ? "text-indigo-400" : "text-amber-500"}`}>
                                {tx.pendingChange > 0 ? `+${tx.pendingChange}` : tx.pendingChange} แต้มคิว
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            คงเหลือ: {tx.resultingCurrent} / {tx.resultingPending} แต้ม
                          </div>
                        </div>

                        {tx.type !== "RESET" && (
                          <button
                            onClick={() => handleResetSingleCustomer(tx.customerId, tx.customer?.displayName || tx.customerPhoneNumber)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-slate-800 rounded-xl transition-all cursor-pointer"
                            title="รีเซ็ตแต้มลูกค้ารายนี้"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Pagination Indicators */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-850">
                      <button
                        disabled={page <= 1}
                        onClick={() => fetchHistory(page - 1)}
                        className="px-3.5 py-1.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        ก่อนหน้า
                      </button>
                      <span className="text-slate-500 text-xs">
                        หน้า {page} จาก {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => fetchHistory(page + 1)}
                        className="px-3.5 py-1.5 bg-slate-950 border border-slate-850 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        ถัดไป
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-16 text-center space-y-2">
                  <ArrowLeftRight className="w-10 h-10 text-slate-700 stroke-[1.5]" />
                  <p className="text-xs text-slate-500">ไม่มีข้อมูลประวัติธุรกรรมที่ตรงกับเงื่อนไข</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* =================================================================
         CUSTOM REACT CONFIRMATION MODAL
         ================================================================= */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-[#090a0f]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-3xl p-6 shadow-xl space-y-4 animate-scale-up text-left">
            <div className="flex items-start gap-3">
              {confirmModal.danger ? (
                <div className="p-2 bg-red-950/50 border border-red-500/30 rounded-xl text-red-400">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
              ) : (
                <div className="p-2 bg-indigo-950/50 border border-indigo-500/30 rounded-xl text-indigo-400">
                  <Award className="w-6 h-6 animate-bounce" />
                </div>
              )}
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-200">{confirmModal.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-350 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-[0.96]"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  confirmModal.onConfirm();
                  setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-[0.96] ${
                  confirmModal.danger 
                    ? "bg-red-600 hover:bg-red-500 text-white" 
                    : "bg-indigo-650 hover:bg-indigo-550 text-white"
                }`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Success Toast */}
      {success && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-slate-900 border border-emerald-500 rounded-2xl flex items-start gap-3 text-slate-200 text-xs shadow-2xl shadow-slate-950/85 animate-toast-in text-left">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-450" />
          <div className="flex-1">
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-500 hover:text-slate-200 text-xs cursor-pointer ml-1">✕</button>
        </div>
      )}

      {/* Floating Error Toast */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-slate-900 border border-rose-500 rounded-2xl flex items-start gap-3 text-slate-200 text-xs shadow-2xl shadow-slate-950/85 animate-toast-in text-left">
          <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-450" />
          <div className="flex-1">
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-500 hover:text-slate-200 text-xs cursor-pointer ml-1">✕</button>
        </div>
      )}
    </main>
  );
}
