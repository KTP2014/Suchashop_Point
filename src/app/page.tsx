"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ShieldAlert } from "lucide-react";
import type { Liff } from "@line/liff";
import { useLiff } from "./providers";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showResetButton, setShowResetButton] = useState(false);

  const { liff: liffInstance, isLoading: liffLoading } = useLiff();

  const clearLocalSessionData = useCallback(() => {
    document.cookie = "session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;";
    localStorage.clear();
    sessionStorage.clear();
  }, []);

  const processLiffLogin = useCallback(async (liff: Liff) => {
    try {
      setError(null);
      let profile;
      try {
        profile = await liff.getProfile();
      } catch (profileErr) {
        console.error("LIFF getProfile failed - possible stale session:", profileErr);
        clearLocalSessionData();
        if (liff.isLoggedIn()) {
          liff.logout();
        }
        window.location.replace(window.location.origin + window.location.pathname + window.location.search);
        return;
      }

      const lineUserId = profile.userId;
      let displayName = profile?.displayName;
      if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
        displayName = "ผู้ใช้งาน LINE";
      }

      // Call liff-login endpoint to set session cookie
      const res = await fetch("/api/auth/liff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineUserId, displayName }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
        }
        const role = data.user?.role;
        
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get("token");

        // Explicitly route to merchant if ADMIN/STAFF/MERCHANT, else to customer (which includes CUSTOMER/PENDING_APPROVAL)
        if (role === "ADMIN" || role === "STAFF" || role === "MERCHANT") {
          router.push("/merchant");
        } else {
          router.push(token ? `/customer?token=${token}` : "/customer");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 401 || errData.message === "Session Invalid" || errData.message === "Unauthorized") {
          clearLocalSessionData();
          if (liff.isLoggedIn()) {
            liff.logout();
          }
          window.location.replace(window.location.origin + window.location.pathname + window.location.search);
          return;
        }
        throw new Error(errData.message || "การเข้าสู่ระบบ LIFF ล้มเหลว");
      }
    } catch (err: unknown) {
      console.error("LIFF login processing failed", err);
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเชื่อมต่อล็อกอินกับระบบ";
      setError(msg);
    }
  }, [router, clearLocalSessionData]);

  const handleSessionReset = useCallback(async (liff?: Liff | null) => {
    // 1. Clear session cookie & local storage
    clearLocalSessionData();

    // 2. Trigger auto-login or LIFF login immediately
    const targetLiff = liff || liffInstance;
    if (targetLiff) {
      if (targetLiff.isLoggedIn()) {
        await processLiffLogin(targetLiff);
      } else {
        targetLiff.login();
      }
    } else {
      window.location.replace(window.location.origin + window.location.pathname + window.location.search);
    }
  }, [clearLocalSessionData, liffInstance, processLiffLogin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowResetButton(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (liffInstance && liffInstance.isLoggedIn()) {
      const timer = setTimeout(() => {
        processLiffLogin(liffInstance);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [liffInstance, processLiffLogin]);

  const handleLiffLogin = async () => {
    if (!liffInstance) return;
    if (!liffInstance.isLoggedIn()) {
      liffInstance.login();
    } else {
      await processLiffLogin(liffInstance);
    }
  };



  return (
    <main className="h-[100dvh] max-h-[100dvh] bg-[#FFF5F6] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans select-none">
      
      {/* Background polka blur circles */}
      <div className="absolute top-[-5%] right-[-5%] w-80 h-80 rounded-full bg-[#FFE2E6]/50 blur-[60px] pointer-events-none" />
      <div className="absolute bottom-[-5%] left-[-5%] w-80 h-80 rounded-full bg-[#FFE2E6]/50 blur-[60px] pointer-events-none" />

      {/* Main card wrapper */}
      <div className="w-full max-w-sm relative">
        
        {/* =================================================================
           CAT DESIGN: PEAKING COZY GRAY EARS ON CARD HEADER
           ================================================================= */}
        <div className="absolute -top-[23px] left-1/2 -translate-x-1/2 w-44 h-8 flex justify-between px-6 pointer-events-none z-0">
          {/* Left Cat Ear */}
          <div className="w-9 h-7 bg-[#5C5556] rounded-t-full relative transform -rotate-12 origin-bottom animate-ear-wiggle">
            <div className="w-5.5 h-5 bg-[#FF8EAA] rounded-t-full absolute bottom-0 left-1.5 opacity-90" />
          </div>
          {/* Right Cat Ear */}
          <div className="w-9 h-7 bg-[#5C5556] rounded-t-full relative transform rotate-12 origin-bottom animate-ear-wiggle">
            <div className="w-5.5 h-5 bg-[#FF8EAA] rounded-t-full absolute bottom-0 right-1.5 opacity-90" />
          </div>
        </div>

        {/* Clean Pure White Login Card (Strict Mobile-First Spacing and No-Scroll Optimization) */}
        <div className="w-full bg-[#FFFFFF] border border-pink-100/50 rounded-3xl px-5 pt-4 pb-16 shadow-sm hover-float relative z-10 overflow-hidden">
          
          {/* =================================================================
             CUTE STICKER: SLEEPING TABBY CAT AT TOP-LEFT (INSIDE CARD)
             ================================================================= */}
          <div className="absolute top-3 left-3 pointer-events-none z-20">
            <svg viewBox="0 0 50 50" className="w-12 h-12">
              {/* Cat Body (Curled Up) */}
              <circle cx="25" cy="28" r="14" fill="#D5D1D2" />
              {/* Shadow/Contrast Stripes */}
              <path d="M15,22 Q25,18 35,22" stroke="#5C5556" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M13,27 Q25,24 37,27" stroke="#5C5556" strokeWidth="2" strokeLinecap="round" fill="none" />
              <path d="M16,33 Q25,31 34,33" stroke="#5C5556" strokeWidth="2" strokeLinecap="round" fill="none" />
              {/* Head tucked in */}
              <circle cx="28" cy="24" r="8" fill="#D5D1D2" />
              <path d="M25,23 Q27,25 29,23" stroke="#5C5556" strokeWidth="1.5" strokeLinecap="round" fill="none" />
              {/* Ears */}
              <polygon points="21,19 18,12 25,16" fill="#D5D1D2" />
              <polygon points="33,18 37,11 31,15" fill="#D5D1D2" />
              {/* Tail wrapped around */}
              <path d="M37,33 Q30,42 18,36" stroke="#D5D1D2" strokeWidth="4.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>

          {/* =================================================================
             CUTE STICKER: NAKED DOUBLE CAT PAW PRINTS AT TOP-RIGHT (INSIDE CARD)
             ================================================================= */}
          <div className="absolute top-4 right-4 pointer-events-none z-20 animate-stamp-float">
            <svg viewBox="0 0 60 60" className="w-11 h-11 transform rotate-12">
              <g transform="translate(4, 8) scale(0.75)">
                <circle cx="20" cy="20" r="8" fill="#FF8EAA" />
                <circle cx="9" cy="9" r="3.2" fill="#FF8EAA" />
                <circle cx="20" cy="5" r="3.2" fill="#FF8EAA" />
                <circle cx="31" cy="9" r="3.2" fill="#FF8EAA" />
              </g>
              <g transform="translate(30, 24) scale(0.6) rotate(-15)">
                <circle cx="20" cy="20" r="8" fill="#FF8EAA" opacity="0.9" />
                <circle cx="9" cy="9" r="3.2" fill="#FF8EAA" opacity="0.9" />
                <circle cx="20" cy="5" r="3.2" fill="#FF8EAA" opacity="0.9" />
                <circle cx="31" cy="9" r="3.2" fill="#FF8EAA" opacity="0.9" />
              </g>
            </svg>
          </div>

          {/* Real Shop Logo (Snug and clean layout with automatic height, no large empty wrapper) */}
            <div className="flex flex-col items-center mt-4 mb-6 pt-2">
              <Image 
                src="/images/logo.png" 
                alt="Sucha Shop Logo" 
                width={240} 
                height={240}
                style={{ height: "auto" }}
                className="w-56 h-auto object-contain"
                priority
              />
            </div>

          {/* Form Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-red-600 text-xs animate-shake leading-relaxed">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* LINE login button */}
          <div className="space-y-3 mb-2 mt-4">
            <button
              type="button"
              onClick={handleLiffLogin}
              disabled={liffLoading}
              className="w-full py-3 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-2xl font-bold shadow-sm flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-300 active:scale-[0.96] tracking-wide text-xs disabled:opacity-50"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M24 10.304c0-5.369-5.383-9.738-12-9.738-6.616 0-12 4.369-12 9.738 0 4.814 4.269 8.846 10.036 9.586.39.084.922.258 1.057.592.12.3.077.769.038 1.073-.038.307-.184 1.23-.231 1.633-.072.631-.322 2.472 1.393 1.348 1.716-1.125 9.277-5.462 12.633-9.351 2.378-2.658 3.074-4.887 3.074-7.281zm-15.61 3.567h-2.113c-.29 0-.527-.236-.527-.528v-4.116c0-.291.237-.528.527-.528h2.113c.291 0 .528.237.528.528 0 .292-.237.528-.528.528h-1.585v1.268h1.585c.291 0 .528.237.528.528s-.237.528-.528.528h-1.585v1.268h1.585c.291 0 .528.237.528.528.001.292-.236.528-.528.528zm3.626 0c0 .292-.236.528-.527.528s-.528-.236-.528-.528v-4.116c0-.291.237-.528.528-.528s.527.237.527.528v4.116zm4.417 0h-2.112c-.29 0-.528-.236-.528-.528v-4.116c0-.291.238-.528.528-.528s.528.237.528.528v3.061l1.584-3.061c.102-.197.306-.322.528-.322.428 0 .668.468.455.84l-1.442 2.784.008.016 1.433.003c.29 0 .527.237.527.528 0 .292-.237.528-.527.528v-.003zm3.627 0h-2.112c-.29 0-.528-.236-.528-.528v-4.116c0-.291.238-.528.528-.528h2.112c.29 0 .528.237.528.528s-.238.528-.528.528h-1.584v.74h1.584c.29 0 .528.237.528.528s-.238.528-.528.528h-1.584v.739h1.584c.29 0 .528.237.528.528s-.238.528-.528.528z" />
              </svg>
              เข้าสู่ระบบด้วย LINE (Log in with LINE)
            </button>
            <p className="text-[9px] text-slate-400 text-center leading-normal mt-1">
              สะสมแต้มอุ้งเท้าแมวแสนสะดวกผ่านบัญชี LINE ของคุณ 🐾
            </p>
            {showResetButton && (
              <button
                type="button"
                onClick={() => handleSessionReset(liffInstance)}
                className="w-full py-2 text-[10px] text-slate-400 hover:text-[#FF7DA0] font-bold tracking-wider uppercase transition-all duration-300 mt-2 underline cursor-pointer"
              >
                พบปัญหาเข้าสู่ระบบ? รีเซ็ตการล็อกอิน (Reset Login)
              </button>
            )}
          </div>

          {/* =================================================================
             CUTE STICKER: ANIMATED ORANGE CAT SITTING BACKWARDS AT BOTTOM-LEFT (INSIDE CARD, MOVED INWARD TO PREVENT CLIP)
             ================================================================= */}
          <div className="absolute bottom-2 left-6 pointer-events-none z-20">
            <svg viewBox="0 0 80 80" className="w-12 h-12">
              <ellipse cx="40" cy="48" rx="20" ry="24" fill="#FFB884" />
              <ellipse cx="40" cy="62" rx="16" ry="6" fill="#FFA260" opacity="0.6" />
              <circle cx="40" cy="22" r="13.5" fill="#FFB884" />
              <polygon points="28,20 22,8 35,14" fill="#FFB884" strokeLinejoin="round" />
              <polygon points="29,19 25,11 34,15" fill="#FFD4B5" />
              <polygon points="52,20 58,8 45,14" fill="#FFB884" strokeLinejoin="round" />
              <polygon points="51,19 55,11 46,15" fill="#FFD4B5" />
              <circle cx="30" cy="24" r="2" fill="#FF8EAA" opacity="0.8" />
              <circle cx="50" cy="24" r="2" fill="#FF8EAA" opacity="0.8" />
              
              <g className="animate-tail-swing">
                <path d="M30,45 Q20,30 22,20" stroke="#FFB884" strokeWidth="7" strokeLinecap="round" fill="none" />
                <path d="M30,45 Q20,30 22,20" stroke="#FFD4B5" strokeWidth="3.5" strokeLinecap="round" fill="none" />
              </g>
            </svg>
          </div>

          {/* =================================================================
             CUTE STICKER: PEEKING BLACK CAT AT BOTTOM-MIDDLE (INSIDE CARD, FULLY SEPARATED AND ENTIRELY IMMUNE TO OVERLAPPING)
             ================================================================= */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-20">
            <svg viewBox="0 0 80 40" className="w-12 h-6">
              <path d="M15,40 C15,20 25,10 40,10 C55,10 65,20 65,40" fill="#3D3839" />
              <polygon points="20,20 12,2 28,12" fill="#3D3839" strokeLinejoin="round" />
              <polygon points="22,18 16,6 27,12" fill="#FF8EAA" />
              <polygon points="60,20 68,2 52,12" fill="#3D3839" strokeLinejoin="round" />
              <polygon points="58,18 64,6 53,12" fill="#FF8EAA" />
              <circle cx="30" cy="25" r="4.5" fill="#FFE66D" />
              <circle cx="30" cy="25" r="2" fill="#3D3839" />
              <circle cx="50" cy="25" r="4.5" fill="#FFE66D" />
              <circle cx="50" cy="25" r="2" fill="#3D3839" />
              <line x1="16" y1="28" x2="3" y2="26" stroke="#3D3839" strokeWidth="1.5" />
              <line x1="16" y1="31" x2="3" y2="33" stroke="#3D3839" strokeWidth="1.5" />
              <line x1="64" y1="28" x2="77" y2="26" stroke="#3D3839" strokeWidth="1.5" />
              <line x1="64" y1="31" x2="77" y2="33" stroke="#3D3839" strokeWidth="1.5" />
            </svg>
          </div>

          {/* =================================================================
             CUTE STICKER: SIAMESE CAT AT BOTTOM-RIGHT (INSIDE CARD, FULLY SEPARATED AND IMMUNE TO CORNER CLIPPING)
             ================================================================= */}
          <div className="absolute bottom-2 right-6 pointer-events-none z-20">
            <svg viewBox="0 0 80 80" className="w-12 h-12">
              <ellipse cx="40" cy="48" rx="20" ry="24" fill="#FFF0E5" />
              <ellipse cx="40" cy="62" rx="16" ry="6" fill="#EAD1BE" opacity="0.6" />
              <circle cx="40" cy="22" r="13.5" fill="#FFF0E5" />
              <polygon points="28,20 22,8 35,14" fill="#5C5556" strokeLinejoin="round" />
              <polygon points="29,19 25,11 34,15" fill="#FF8EAA" />
              <polygon points="52,20 58,8 45,14" fill="#5C5556" strokeLinejoin="round" />
              <polygon points="51,19 55,11 46,15" fill="#FF8EAA" />
              <ellipse cx="40" cy="24" rx="9.5" ry="7.5" fill="#5C5556" />
              <ellipse cx="36" cy="22" rx="2" ry="3" fill="#66D3FA" />
              <circle cx="36" cy="22" r="0.8" fill="#FFFFFF" />
              <ellipse cx="44" cy="22" rx="2" ry="3" fill="#66D3FA" />
              <circle cx="44" cy="22" r="0.8" fill="#FFFFFF" />
              <polygon points="40,26 38,24 42,24" fill="#FF8EAA" />
            </svg>
          </div>

        </div>

      </div>

      {/* Clean Minimalist Branding (Contrast Optimized) */}
      <div className="mt-4 text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1 select-none">
        Sucha • Loyalty Reward System
      </div>
    </main>
  );
}
