"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Html5Qrcode } from "html5-qrcode";
import {
  Award, Loader2, RefreshCw, Smartphone,
  Gift, ShieldAlert, ArrowLeftRight, Search,
  CheckCircle2, XCircle, Trash2, LogOut, QrCode, Camera, Send,
  Users, Sparkles
} from "lucide-react";

interface TransactionItem {
  id: string;
  customerId: string;
  customerPhoneNumber: string;
  type: "EARN" | "REDEEM" | "RESET" | "ADJUSTMENT" | string;
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

interface Reward {
  id: string;
  name: string;
  points: number;
  isActive?: boolean;
}

interface StaffMember {
  id: string;
  displayName: string | null;
  phoneNumber: string | null;
  lineUserId: string | null;
  role: string;
  createdAt: string;
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

  // Scanning Customer Redemption State
  const [scanningRedeem, setScanningRedeem] = useState(false);
  const qrScannerRef = useRef<Html5Qrcode | null>(null);

  // OTP Verification State (Camera-less backup)
  const [otpCode, setOtpCode] = useState("");
  const [otpActionType, setOtpActionType] = useState<"EARN" | "REDEEM">("EARN");
  const [otpPoints, setOtpPoints] = useState<number>(1);
  const [selectedOtpRewardId, setSelectedOtpRewardId] = useState<string>("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // Admin Pending Staff State
  const [pendingStaff, setPendingStaff] = useState<PendingStaffItem[]>([]);
  const [loadingPendingStaff, setLoadingPendingStaff] = useState(false);

  // Admin Staff Management List State
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loadingStaffMembers, setLoadingStaffMembers] = useState(false);

  // Admin God Mode State
  const [godModePoints, setGodModePoints] = useState<string>("1");
  const [processingGodMode, setProcessingGodMode] = useState(false);

  // v3.0 Dynamic Config States
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [announcement, setAnnouncement] = useState<string>("");
  const [newRewardName, setNewRewardName] = useState<string>("");
  const [newRewardPoints, setNewRewardPoints] = useState<string>("10");
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Custom Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Success Modal State
  interface SuccessModalState {
    isOpen: boolean;
    title: string;
    pointsText?: string;
    detailsText: string;
    type?: "EARN" | "REDEEM" | "RESET" | "ADJUSTMENT" | string | null;
  }
  const [successModal, setSuccessModal] = useState<SuccessModalState>({
    isOpen: false,
    title: "",
    pointsText: "",
    detailsText: "",
    type: null,
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

  const fetchConfig = useCallback(async () => {
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
      console.error("Failed to fetch shop configurations:", err);
    }
  }, []);

  const fetchPendingStaff = useCallback(async () => {
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
  }, []);

  const fetchStaffList = useCallback(async () => {
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
  }, []);

  const checkUserAccess = useCallback(async () => {
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
          await fetchConfig(); // Load rewards and announcement on mount
          if (data.role === "ADMIN") {
            await fetchPendingStaff();
            await fetchStaffList();
          }
        } else {
          router.push("/customer");
        }
      }
    } catch {
      router.push("/");
    }
  }, [router, fetchConfig, fetchPendingStaff, fetchStaffList]);

  const fetchHistory = useCallback(async (targetPage: number) => {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลประวัติ";
      setError(msg);
    } finally {
      setLoadingHistory(false);
    }
  }, [searchName, actionType]);

  const handleSaveConfig = async (updatedRewards = rewards, updatedAnnouncement = announcement) => {
    setSavingConfig(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/merchant/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          announcement: updatedAnnouncement,
          rewards: updatedRewards,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "บันทึกตั้งค่าระบบล้มเหลว");
      }
      setSuccess("บันทึกประกาศร้านค้าและรายการของรางวัลเรียบร้อยแล้ว!");
      await fetchConfig();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
      setError(msg);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAddReward = () => {
    if (!newRewardName.trim()) {
      setError("กรุณากรอกชื่อของรางวัล");
      return;
    }
    const uniqueId = `reward_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const parsedPoints = parseInt(newRewardPoints, 10);
    const finalPoints = isNaN(parsedPoints) || parsedPoints < 1 ? 1 : parsedPoints;
    const newReward = {
      id: uniqueId,
      name: newRewardName.trim(),
      points: finalPoints,
      isActive: true,
    };
    const updatedRewards = [...rewards, newReward];
    setRewards(updatedRewards);
    setNewRewardName("");
    setNewRewardPoints("10");
    handleSaveConfig(updatedRewards, announcement);
  };

  const handleDeleteReward = (rewardId: string) => {
    const updatedRewards = rewards.map((r) => {
      if (r.id === rewardId) {
        return { ...r, isActive: false };
      }
      return r;
    });
    setRewards(updatedRewards);
    handleSaveConfig(updatedRewards, announcement);
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
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการทำรายการปรับบทบาท";
          setError(msg);
        }
      }
    );
  };

  useEffect(() => {
    const checkAccessAndHistory = async () => {
      await checkUserAccess();
      await fetchHistory(1);
    };

    const timer = setTimeout(() => {
      checkAccessAndHistory();
    }, 0);

    return () => {
      clearTimeout(timer);
      if (qrScannerRef.current && qrScannerRef.current.isScanning) {
        qrScannerRef.current.stop().catch(console.error);
      }
    };
  }, [actionType, checkUserAccess, fetchHistory]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (userRole) { // Only fetch if user session is loaded
        fetchHistory(1);
      }
    }, 450);
    return () => clearTimeout(delayDebounce);
  }, [searchName, userRole, fetchHistory]);

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
      const timer = setTimeout(() => {
        setActiveQR(null);
        setQrBlobUrl(null);
      }, 0);
      return () => clearTimeout(timer);
    }
    const timer = setInterval(() => {
      setQrTtl((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [qrTtl]);

  // Polling status of pending points earning QR code
  useEffect(() => {
    if (!activeQR) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/merchant/qr-status?token=${activeQR}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.status === "USED") {
            setSuccessModal({
              isOpen: true,
              title: "สะสมแต้มสำเร็จ! 🐾",
              pointsText: `+${data.points} แต้ม`,
              detailsText: `ลูกค้า ${data.customerName || "ผู้ใช้งาน"} สแกนรับแต้มสะสมเรียบร้อยแล้ว`,
              type: "EARN",
            });
            // Reset QR code states safely
            setTimeout(() => {
              setActiveQR(null);
              setQrBlobUrl(null);
              setQrTtl(0);
            }, 0);
            await fetchHistory(page);
          }
        }
      } catch (err) {
        console.error("Error polling QR earn status:", err);
      }
    }, 2000);

    return () => clearInterval(intervalId);
  }, [activeQR, page, fetchHistory]);

  const handleLogout = () => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/");
  };

  const generateEarnQR = async () => {
    setGeneratingQR(true);
    setError(null);
    setSuccess(null);

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

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
      const qrUrl = `https://liff.line.me/${liffId}?token=${rawToken}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: "#3D3839", // Standard dark charcoal foreground
          light: "#FFFFFF", // Standard high-contrast white background
        },
      });

      setQrBlobUrl(qrDataUrl);
      setQrTtl(300); // 5 Minutes
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการสร้าง QR สะสมแต้ม";
      setError(msg);
    } finally {
      setGeneratingQR(false);
    }
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
            let targetToken = decodedText.trim();
            try {
              const parsed = JSON.parse(decodedText);
              if (parsed.token) targetToken = parsed.token.trim();
            } catch {
              // Raw text fallback
            }
            await stopRedeemScanner();
            await processRedemptionCoupon(targetToken);
          },
          () => {}
        );
      } catch (err: unknown) {
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
      } catch {
        // Suppress scanner stop error
      }
    }
    setScanningRedeem(false);
  };

  const processRedemptionCoupon = async (token: string) => {
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/merchant/scan-redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "การแลกของรางวัลล้มเหลว");
      }

      setSuccessModal({
        isOpen: true,
        title: "แลกของรางวัลสำเร็จ! 🐾",
        pointsText: data.rewardName || "ของรางวัล",
        detailsText: "ทำรายการแลกรับของรางวัลสำเร็จเรียบร้อยแล้ว",
        type: "REDEEM",
      });
      await fetchHistory(page);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการประมวลผลคูปองแลกรางวัล";
      setError(msg);
    }
  };

  // v2.0 Verify Customer OTP backup
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6 || !/^[0-9]+$/.test(otpCode)) {
      setError("กรุณากรอกรหัส OTP เป็นตัวเลข 6 หลัก");
      return;
    }

    let reqPoints: number | undefined = undefined;
    let rewardId: string | undefined = undefined;
    let rewardName: string | undefined = undefined;

    if (otpActionType === "EARN") {
      reqPoints = otpPoints;
    } else {
      const matchedReward = rewards.find(r => r.id === selectedOtpRewardId);
      if (!matchedReward) {
        setError("กรุณาเลือกของรางวัลที่ลูกค้าต้องการแลก");
        return;
      }
      reqPoints = matchedReward.points;
      rewardId = matchedReward.id;
      rewardName = matchedReward.name;
    }

    const actionLabel = otpActionType === "EARN" 
      ? `สะสมแต้มจำนวน +${otpPoints} แต้ม` 
      : `แลกรับของรางวัล "${rewardName}" (ใช้ ${reqPoints} คะแนน)`;

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
              points: reqPoints,
              rewardId,
              rewardName,
            }),
          });
          const data = await res.json();

          if (!res.ok || !data.success) {
            throw new Error(data.message || "การตรวจสอบสิทธิ์รหัส OTP ล้มเหลว");
          }

          setSuccessModal({
            isOpen: true,
            title: otpActionType === "EARN" ? "สะสมแต้มสำเร็จ! 🐾" : "แลกของรางวัลสำเร็จ! 🐾",
            pointsText: otpActionType === "EARN" ? `+${data.addedPoints || otpPoints} แต้ม` : `${data.rewardName || rewardName || "ของรางวัล"}`,
            detailsText: otpActionType === "EARN" ? "สะสมแต้มสำเร็จผ่านรหัส OTP เรียบร้อย" : "ใช้สิทธิ์แลกของรางวัลสำเร็จเรียบร้อย",
            type: otpActionType,
          });
          setOtpCode("");
          setSelectedOtpRewardId("");
          await fetchHistory(page);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP";
          setError(msg);
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
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการรีเซ็ตแต้ม";
          setError(msg);
        } finally {
          setProcessingGodMode(false);
        }
      },
      true
    );
  };

  // Admin God Mode: Grant points to everyone
  const handleAdminAddPointsAll = () => {
    const parsedPoints = parseInt(godModePoints, 10);
    const finalPoints = isNaN(parsedPoints) || parsedPoints < 1 ? 1 : parsedPoints;

    triggerConfirm(
      "ยืนยันการเพิ่มแต้มแจกทุกคน",
      `คุณต้องการเพิ่มแต้มสะสม (+${finalPoints} แต้ม) ให้กับลูกค้าทุกคนในระบบใช่หรือไม่? สำหรับคนที่มีแต้มเกินจะถูกเก็บไว้ที่แต้มรอคิว (Overflow)`,
      async () => {
        setProcessingGodMode(true);
        setError(null);
        setSuccess(null);
        try {
          const res = await fetch("/api/merchant/admin/add-point-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ points: finalPoints }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.message || "การเพิ่มแต้มแจกลูกค้าทุกคนล้มเหลว");
          }
          setSuccessModal({
            isOpen: true,
            title: "แจกแต้มลูกค้าทุกคนสำเร็จ! 🐾",
            pointsText: `+${finalPoints} แต้ม`,
            detailsText: `ทำการแจกแต้มสะสมจำนวน +${finalPoints} แต้ม ให้กับลูกค้าทั้งหมด (${data.count} บัญชี)`,
            type: "EARN",
          });
          await fetchHistory(page);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการแจกแต้ม";
          setError(msg);
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
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการล้างแต้มลูกค้า";
          setError(msg);
        }
      },
      true
    );
  };

  if (loadingUser) {
    return (
      <div className="min-h-screen bg-[#FFF5F6] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[#FF7DA0] animate-spin mb-3" />
        <p className="text-sm text-slate-500 font-semibold">กำลังตรวจสอบสิทธิ์การใช้งาน...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF5F6] text-slate-750 p-6 relative overflow-hidden font-sans select-none">
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-pink-100/30 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-pink-200/20 blur-[120px] pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation Bar */}
        <div className="flex items-center justify-between bg-white border border-pink-100/50 p-4 rounded-3xl shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-tr from-[#FF7DA0] to-pink-600 rounded-xl flex items-center justify-center shadow-md shadow-pink-500/10">
              <Award className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-sm tracking-tight text-slate-800">Sucha ระบบหลังร้าน</span>
              <span className="text-[9px] text-slate-500 font-semibold">
                พนักงาน: {userName} • สิทธิ์: {userRole === "ADMIN" ? "ผู้ดูแลระบบ (Admin)" : "พนักงานร้าน (Staff)"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push("/customer?test=true")}
              className="px-3.5 py-2 text-xs font-bold text-[#FF7DA0] bg-pink-50 hover:bg-pink-100/80 border border-pink-150 rounded-xl transition-all cursor-pointer"
            >
              หน้าลูกค้า
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200/50 rounded-xl transition-all cursor-pointer animate-pulse"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-700 text-sm animate-fade-in relative text-left">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
            <div className="flex-1">
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="absolute top-2 right-2 text-emerald-500 hover:text-emerald-700 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-700 text-sm animate-shake relative text-left">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
            <div className="flex-1">
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 text-xs cursor-pointer">✕</button>
          </div>
        )}

        {/* Main Body Split Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: QR Generator & Scanning Coupons & OTP Verify */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Dynamic Points QR Generator */}
            <div className="bg-white border border-pink-100/50 p-5 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 self-start">
                <QrCode className="w-4 h-4 text-[#FF7DA0]" />
                เครื่องสร้าง QR สะสมแต้ม
              </h3>

              {/* Point Input selector (1 to 5) */}
              <div className="w-full space-y-2">
                <label className="text-base font-semibold text-slate-700 block mb-1">
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
                          ? "bg-[#FF7DA0] text-white border border-[#FF7DA0] shadow-sm"
                          : "bg-slate-50 border border-pink-100/20 text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      +{p}
                    </button>
                  ))}
                </div>
              </div>

              {qrBlobUrl && activeQR ? (
                <div className="flex flex-col items-center space-y-3 w-full animate-fade-in">
                  <div className="p-2.5 bg-white border border-pink-100 rounded-2xl shadow-inner">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrBlobUrl} alt="คิวอาร์โค้ดสำหรับสะสมแต้ม" className="w-44 h-44 rounded-xl" />
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-slate-500">QR Code (+{pointsToGrant} แต้ม) จะหมดอายุใน:</p>
                    <p className="text-md font-bold text-[#FF7DA0] font-mono">
                      {Math.floor(qrTtl / 60)}:{(qrTtl % 60).toString().padStart(2, "0")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center justify-center py-6 px-6 border border-dashed border-pink-150 rounded-2xl text-center space-y-2">
                  <QrCode className="w-10 h-10 text-slate-400 stroke-[1.5]" />
                  <p className="text-xs text-slate-400">ยังไม่มีการสร้าง QR สะสมแต้ม</p>
                </div>
              )}

              <button
                onClick={generateEarnQR}
                disabled={generatingQR}
                className="w-full py-3 bg-gradient-to-r from-[#FF7DA0] to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white rounded-2xl font-bold shadow-lg shadow-pink-500/10 flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 active:scale-[0.98]"
              >
                {generatingQR ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "แสดง QR สะสมแต้ม"
                )}
              </button>
            </div>

            {/* 2. Customer Coupon Redemption Scanner */}
            <div className="bg-white border border-pink-100/50 p-5 rounded-3xl shadow-sm flex flex-col items-center justify-center space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 self-start">
                <Gift className="w-4 h-4 text-emerald-500" />
                สแกนคูปองแลกรางวัลลูกค้า
              </h3>

              {scanningRedeem ? (
                <div className="w-full space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">สแกนคูปอง QR โค้ดของลูกค้า</span>
                    <button
                      onClick={stopRedeemScanner}
                      className="p-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-slate-500 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <div id="redeem-reader" className="w-full aspect-square overflow-hidden rounded-2xl border border-pink-100 bg-slate-50" />
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
            <div className="bg-white border border-pink-100/50 p-5 rounded-3xl shadow-sm flex flex-col space-y-4 text-left">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-[#FF7DA0]" />
                ระบบสะสมแต้มผ่านรหัส OTP (กล้องเสีย/ไม่มีกล้อง)
              </h3>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-base font-semibold text-slate-700 block mb-1">
                    รหัส OTP 6 หลักของลูกค้า
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="ตัวอย่าง 123456"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-pink-100/60 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-slate-800 placeholder-slate-400 text-sm tracking-widest font-bold text-center transition-all font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOtpActionType("EARN")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      otpActionType === "EARN"
                        ? "bg-[#FF7DA0] text-white border-[#FF7DA0] shadow-sm"
                        : "bg-slate-50 border-pink-100/20 text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    สะสมแต้ม (Earn)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtpActionType("REDEEM")}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      otpActionType === "REDEEM"
                        ? "bg-emerald-600 text-white border-emerald-500 shadow-sm"
                        : "bg-slate-50 border-pink-100/20 text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    แลกรางวัล (Redeem)
                  </button>
                </div>

                {otpActionType === "EARN" && (
                  <div className="space-y-2 animate-fade-in text-left">
                    <label className="text-base font-semibold text-slate-700 block mb-1">
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
                              ? "bg-[#FF7DA0] text-white border border-[#FF7DA0]"
                              : "bg-slate-50 border border-pink-100/20 text-slate-500 hover:text-slate-700"
                          }`}
                        >
                          +{p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {otpActionType === "REDEEM" && (
                  <div className="space-y-2 animate-fade-in text-left">
                    <label className="text-base font-semibold text-slate-700 block mb-1">
                      เลือกของรางวัลที่ต้องการแลก
                    </label>
                    <select
                      value={selectedOtpRewardId}
                      onChange={(e) => setSelectedOtpRewardId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-pink-100/60 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs cursor-pointer font-semibold"
                    >
                      <option value="">-- เลือกของรางวัล --</option>
                      {rewards.filter(r => r.isActive !== false).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} (ใช้ {r.points} คะแนน)
                        </option>
                      ))}
                    </select>
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
              <div className="bg-white border border-pink-100/50 p-6 rounded-3xl shadow-sm space-y-6 text-left">
                <div className="flex items-center gap-2 border-b border-pink-50 pb-3">
                  <Users className="w-5 h-5 text-amber-500 animate-pulse" />
                  <h3 className="text-lg font-bold uppercase tracking-wider text-slate-800">
                    แผงควบคุมระบบ (Admin Console)
                  </h3>
                </div>

                {/* A. Pending Staff Approvals Panel */}
                <div className="space-y-3">
                  <h4 className="text-base font-bold text-slate-700">
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
                          className="p-4 bg-slate-50 border border-pink-100/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-slate-800">
                              {staff.displayName || "ไม่ระบุชื่อ"}
                            </div>
                            <div className="text-[10px] text-slate-500 leading-normal">
                              เบอร์: {staff.phoneNumber || "ไม่มี"} • LINE: {staff.lineUserId ? staff.lineUserId.slice(0, 10) + "..." : "ไม่มี"}
                            </div>
                          </div>

                          <div className="flex gap-1.5 self-end sm:self-center">
                            <button
                              onClick={() => handleApproveStaff(staff.id, "STAFF", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              พนักงาน (Staff)
                            </button>
                            <button
                              onClick={() => handleApproveStaff(staff.id, "ADMIN", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-100 text-amber-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              แอดมิน (Admin)
                            </button>
                            <button
                              onClick={() => handleApproveStaff(staff.id, "REJECT", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              ปฏิเสธ
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/50 border border-dashed border-pink-150 rounded-2xl text-center">
                      <p className="text-xs text-slate-400">ไม่มีคำขอสิทธิ์พนักงานที่ค้างอนุมัติ 🐾</p>
                    </div>
                  )}
                </div>

                {/* B. Staff Management Panel */}
                <div className="pt-4 border-t border-pink-50 space-y-3">
                  <h4 className="text-base font-bold text-slate-700">
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
                          className="p-4 bg-[#FCF8F9] border border-pink-100/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                              {staff.displayName || "ไม่ระบุชื่อ"}
                              {staff.role === "ADMIN" ? (
                                <span className="px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded text-[9px] font-bold">
                                  ADMIN
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded text-[9px] font-bold">
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
                                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-100 text-amber-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                              >
                                แต่งตั้งเป็น Admin
                              </button>
                            )}
                            {staff.role === "ADMIN" && (
                              <button
                                onClick={() => handleApproveStaff(staff.id, "STAFF", staff.displayName || "ไม่ระบุชื่อ")}
                                className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                              >
                                ลดระดับเป็น Staff
                              </button>
                            )}
                            <button
                              onClick={() => handleApproveStaff(staff.id, "REJECT", staff.displayName || "ไม่ระบุชื่อ")}
                              className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg text-[10px] font-bold cursor-pointer transition-all active:scale-[0.95]"
                            >
                              ถอดสิทธิ์พนักงาน
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50/50 border border-dashed border-pink-150 rounded-2xl text-center">
                      <p className="text-xs text-slate-400">ไม่มีพนักงานในระบบ 🐾</p>
                    </div>
                  )}
                </div>

                {/* C. Admin God Mode Actions */}
                <div className="pt-5 border-t border-pink-50 space-y-4">
                  <div className="flex items-center gap-1.5 text-rose-500">
                    <ShieldAlert className="w-4 h-4 animate-pulse" />
                    <h4 className="text-base font-bold uppercase tracking-wider">
                      โหมดผู้ดูแลระบบสูงสุด
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Add point to all customers card */}
                    <div className="p-4 bg-slate-50 border border-pink-100/20 rounded-2xl flex flex-col justify-between space-y-4 hover:border-pink-100/50 transition-all">
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-[#FF7DA0] uppercase tracking-wider block">
                          เพิ่มแต้มแจกทุกคน
                        </span>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          เพิ่มจำนวนแต้ม (+1 ถึง +5) 
                        </p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <div className="relative flex-shrink-0">
                          <input
                            type="number"
                            min={1}
                            max={5}
                            value={godModePoints}
                            onChange={(e) => setGodModePoints(e.target.value)}
                            className="h-10 w-16 px-3 bg-white border border-pink-100/60 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs text-center font-bold font-mono"
                          />
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
                    <div className="p-4 bg-slate-50 border border-pink-100/20 rounded-2xl flex flex-col justify-between space-y-4 hover:border-pink-100/50 transition-all">
                      <div className="space-y-1">
                        <span className="text-sm font-bold text-rose-500 uppercase tracking-wider block">
                          ล้างแต้มทุกคนเป็น 0
                        </span>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          ⚠️ เคลียร์แต้มสะสมทั้งหมดของทุกคนให้กลายเป็นศูนย์ (ไม่สามารถเรียกคืนประวัติแต้มเดิมได้)
                        </p>
                      </div>

                      <button
                        onClick={handleAdminResetAll}
                        disabled={processingGodMode}
                        className="w-full h-10 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96] flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/10"
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

                {/* D. Shop Announcement Editor */}
                <div className="pt-5 border-t border-pink-50 space-y-3">
                  <h4 className="text-base font-bold text-slate-700 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-[#FF7DA0]" />
                    จัดการประกาศร้านค้า (Shop Announcement Editor)
                  </h4>
                  <div className="space-y-3">
                    <textarea
                      value={announcement}
                      onChange={(e) => setAnnouncement(e.target.value)}
                      placeholder="พิมพ์ประกาศสำหรับแสดงบนหน้าลูกค้า..."
                      className="w-full h-20 px-3.5 py-2.5 bg-slate-50 border border-pink-100/60 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs transition-all font-semibold resize-none"
                    />
                    <button
                      onClick={() => handleSaveConfig(rewards, announcement)}
                      disabled={savingConfig}
                      className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-[#FF7DA0] to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.96] flex items-center justify-center gap-1.5 shadow-md shadow-pink-500/10 cursor-pointer disabled:opacity-50"
                    >
                      {savingConfig ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      บันทึกประกาศ
                    </button>
                  </div>
                </div>

                {/* E. Reward Config Panel */}
                <div className="pt-5 border-t border-pink-50 space-y-3">
                  <h4 className="text-base font-bold text-slate-700 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-emerald-500" />
                    จัดการรายการของรางวัล (Reward Config Panel)
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-slate-700 block mb-1">
                          ชื่อของรางวัล
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น พวงกุญแจ, เครื่องดื่มฟรี"
                          value={newRewardName}
                          onChange={(e) => setNewRewardName(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-pink-100/60 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs transition-all font-semibold"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-base font-semibold text-slate-700 block mb-1">
                          คะแนนที่ต้องใช้แลก (แต้มปกติ)
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newRewardPoints}
                          onChange={(e) => setNewRewardPoints(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-pink-100/60 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs transition-all font-semibold font-mono"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleAddReward}
                      disabled={savingConfig}
                      className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all active:scale-[0.96] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      เพิ่มของรางวัลใหม่
                    </button>
                  </div>

                   <div className="space-y-2 mt-4">
                    <label className="text-base font-semibold text-slate-700 block mb-1">
                      รายการของรางวัลปัจจุบัน ({rewards.filter(r => r.isActive !== false).length})
                    </label>
                    {rewards.filter(r => r.isActive !== false).length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {rewards.filter(r => r.isActive !== false).map((r) => (
                          <div 
                            key={r.id} 
                            className="p-3 bg-[#FCF8F9] border border-pink-100/20 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="space-y-1">
                              <span className="text-xs font-bold text-slate-700">{r.name}</span>
                              <span className="block text-xs text-[#FF7DA0] font-bold font-mono">
                                ใช้ {r.points} คะแนน
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteReward(r.id)}
                              disabled={savingConfig}
                              className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 border border-pink-100/30 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                              title="ลบของรางวัลนี้"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic text-center py-2">ไม่มีของรางวัลในระบบ</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Point History Ledger Log */}
            <div className="bg-white border border-pink-100/50 p-5 rounded-3xl shadow-sm flex flex-col space-y-4 text-left">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                  History Log
                </h3>
                <button
                  onClick={() => fetchHistory(1)}
                  className="p-1.5 hover:bg-slate-100 border border-slate-200/50 rounded-xl text-slate-500 hover:text-[#FF7DA0] transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Filter Search bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="ค้นหาชื่อเล่นหรือชื่อไลน์ลูกค้า..."
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-pink-100/60 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 placeholder-slate-400 text-xs transition-all focus:ring-1 focus:ring-[#FF7DA0]/20 font-semibold"
                  />
                </div>
                <div className="relative">
                  <select
                    value={actionType}
                    onChange={(e) => setActionType(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-50 border border-pink-100/60 rounded-xl focus:outline-none focus:border-[#FF7DA0] text-slate-700 text-xs transition-all cursor-pointer appearance-none font-semibold text-center"
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
                  <Loader2 className="w-6 h-6 text-[#FF7DA0] animate-spin" />
                </div>
              ) : history.length > 0 ? (
                <div className="space-y-3 flex-1">
                  {history.map((tx) => (
                    <div
                      key={tx.id}
                      className="p-4 bg-slate-50 border border-pink-100/10 rounded-2xl flex items-center justify-between gap-3 text-xs animate-fade-in"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">
                            {tx.customer?.displayName || tx.customerPhoneNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                              tx.type === "EARN"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-250"
                                : tx.type === "REDEEM"
                                ? "bg-violet-50 text-violet-600 border border-violet-250"
                                : tx.type === "RESET"
                                ? "bg-rose-50 text-rose-600 border border-rose-250"
                                : "bg-slate-100 text-slate-500 border border-slate-200"
                            }`}
                          >
                            {tx.type}
                          </span>
                        </div>
                        <div className="text-xs text-slate-450">
                          {new Date(tx.createdAt).toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bold">
                            {tx.currentChange !== 0 && (
                              <span className={`text-sm sm:text-base font-extrabold block ${tx.currentChange > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                {tx.currentChange > 0 ? `+${tx.currentChange}` : tx.currentChange} แต้มปกติ
                              </span>
                            )}
                            {tx.pendingChange !== 0 && (
                              <span className={`block text-xs font-bold ${tx.pendingChange > 0 ? "text-indigo-650" : "text-amber-600"}`}>
                                {tx.pendingChange > 0 ? `+${tx.pendingChange}` : tx.pendingChange} แต้มคิว
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-slate-500">
                            คงเหลือ: {tx.resultingCurrent + tx.resultingPending} แต้ม
                          </div>
                        </div>

                        {tx.type !== "RESET" && (
                          <button
                            onClick={() => handleResetSingleCustomer(tx.customerId, tx.customer?.displayName || tx.customerPhoneNumber)}
                            className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-50 border border-pink-100/30 rounded-xl transition-all cursor-pointer"
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
                    <div className="flex items-center justify-between pt-4 border-t border-pink-50">
                      <button
                        disabled={page <= 1}
                        onClick={() => fetchHistory(page - 1)}
                        className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/50 text-slate-600 hover:text-[#FF7DA0] rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        ก่อนหน้า
                      </button>
                      <span className="text-slate-450 text-xs">
                        หน้า {page} จาก {totalPages}
                      </span>
                      <button
                        disabled={page >= totalPages}
                        onClick={() => fetchHistory(page + 1)}
                        className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/50 text-slate-600 hover:text-[#FF7DA0] rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 bg-[#090a0f]/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-pink-100/50 w-full max-w-sm rounded-3xl p-6 shadow-xl space-y-4 animate-scale-up text-left">
            <div className="flex items-start gap-3">
              {confirmModal.danger ? (
                <div className="p-2 bg-rose-50 border border-rose-200 rounded-xl text-rose-500">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
              ) : (
                <div className="p-2 bg-pink-50 border border-pink-100 rounded-xl text-[#FF7DA0]">
                  <Award className="w-6 h-6 animate-bounce" />
                </div>
              )}
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-800">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{confirmModal.message}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-[0.96]"
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
                    ? "bg-rose-600 hover:bg-rose-500 text-white shadow-sm" 
                    : "bg-[#FF7DA0] hover:bg-pink-600 text-white shadow-sm"
                }`}
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
         ULTRA-PROMINENT SUCCESS POPUP MODAL
         ================================================================= */}
      {successModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-pink-100/50 w-full max-w-sm rounded-3xl p-8 shadow-2xl space-y-6 animate-scale-up text-center flex flex-col items-center">
            
            {/* Huge Success Icon */}
            <div className={`p-4 rounded-full ${
              successModal.type === "EARN" 
                ? "bg-emerald-50 text-emerald-500" 
                : "bg-pink-50 text-[#FF7DA0]"
            } animate-bounce`}>
              <CheckCircle2 className="w-16 h-16 stroke-[2.5]" />
            </div>

            {/* Title */}
            <div className="space-y-1">
              <h3 className="text-lg font-extrabold text-slate-800">{successModal.title}</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">{successModal.detailsText}</p>
            </div>

            {/* High-Contrast Points/Reward Text */}
            <div className="py-4 w-full bg-slate-50 rounded-2xl border border-slate-100/50 shadow-inner flex flex-col items-center justify-center">
              <span className={`text-4xl sm:text-5xl font-black tracking-tight ${
                successModal.type === "EARN" 
                  ? "text-emerald-600" 
                  : "text-[#FF7DA0]"
              }`}>
                {successModal.pointsText}
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1.5">
                {successModal.type === "EARN" ? "คะแนนที่ได้รับ" : "ของรางวัลที่แลก"}
              </span>
            </div>

            {/* Full-width Close Button */}
            <button
              onClick={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
              className="w-full py-3.5 bg-gradient-to-r from-[#FF7DA0] to-pink-600 hover:from-pink-500 hover:to-pink-700 text-white rounded-2xl font-bold shadow-lg shadow-pink-500/10 cursor-pointer transition-all duration-300 active:scale-[0.98] text-base"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* Floating Success Toast */}
      {success && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-white border border-emerald-250 rounded-2xl flex items-start gap-3 text-slate-700 text-xs shadow-xl animate-toast-in text-left">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-500" />
          <div className="flex-1">
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer ml-1">✕</button>
        </div>
      )}

      {/* Floating Error Toast */}
      {error && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm p-4 bg-white border border-rose-250 rounded-2xl flex items-start gap-3 text-slate-700 text-xs shadow-xl animate-toast-in text-left">
          <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500" />
          <div className="flex-1">
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer ml-1">✕</button>
        </div>
      )}
    </main>
  );
}
