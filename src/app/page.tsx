"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Phone, Calendar, Lock, UserCheck, ShieldAlert } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"customer" | "merchant">("customer");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Sanitize phone number (strip spaces, hyphens, and parentheses, keeping leading +)
    let cleanedPhone = phoneNumber.replace(/[^0-9+]/g, "");
    let formattedPhone = cleanedPhone;
    if (!formattedPhone.startsWith("+")) {
      if (formattedPhone.startsWith("0")) {
        formattedPhone = "+66" + formattedPhone.substring(1);
      } else {
        formattedPhone = "+66" + formattedPhone;
      }
    }

    // Sanitize birthdate (strip non-digit characters like slashes, dashes, or spaces)
    const cleanedBirthdate = birthdate.replace(/[^0-9]/g, "");

    const payload =
      activeTab === "customer"
        ? { phoneNumber: formattedPhone, birthdate: cleanedBirthdate }
        : { phoneNumber: formattedPhone, password: password };

    const endpoint =
      activeTab === "customer"
        ? "/api/auth/customer"
        : "/api/auth/merchant";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "ระบบไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูล");
      }

      if (activeTab === "customer") {
        router.push("/customer");
      } else {
        router.push("/merchant");
      }
    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
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

          {/* Tab Navigation */}
          <div className="grid grid-cols-2 p-1 bg-[#F9F9F9] border border-pink-100/30 rounded-2xl mb-3.5">
            <button
              onClick={() => {
                setActiveTab("customer");
                setError(null);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "customer"
                  ? "bg-[#FF7DA0] text-white shadow-sm"
                  : "text-slate-400 hover:text-[#5C5556]"
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Customer
            </button>
            <button
              onClick={() => {
                setActiveTab("merchant");
                setError(null);
              }}
              className={`py-2 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === "merchant"
                  ? "bg-[#FF7DA0] text-white shadow-sm"
                  : "text-slate-400 hover:text-[#5C5556]"
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Merchant
            </button>
          </div>

          {/* Form Error Banner */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2 text-red-600 text-xs animate-shake leading-relaxed">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Input Fields */}
          <form onSubmit={handleLogin} className="space-y-3 mb-2">
            
            {/* Phone Number Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                เบอร์โทรศัพท์ (Phone Number)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  required
                  placeholder="ตัวอย่าง 0812345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-[#F9F9F9] border border-pink-100 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all focus:ring-2 focus:ring-[#FF7DA0]/10"
                />
              </div>
            </div>

            {/* Birthdate / Password Input with High Contrast Enhancements */}
            {activeTab === "customer" ? (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  วันเกิด (DDMMYYYY)
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="ตัวอย่าง 28021998"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-[#F9F9F9] border border-pink-100 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all focus:ring-2 focus:ring-[#FF7DA0]/10"
                  />
                </div>
                <p className="text-[12px] text-slate-600 leading-none pl-0.5 mt-1 font-semibold">
                  <br></br>
                  สมัครสมาชิกให้อัตโนมัติเมื่อเข้าใช้งานครั้งแรก 🐾
                  <br></br>
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  รหัสผ่าน (Password)
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="ป้อนรหัสผ่านของคุณ"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-11 pr-4 py-2.5 bg-[#F9F9F9] border border-pink-100 rounded-2xl focus:outline-none focus:border-[#FF7DA0] text-[#5C5556] placeholder-slate-400 text-xs transition-all focus:ring-2 focus:ring-[#FF7DA0]/10"
                  />
                </div>
              </div>
            )}

            {/* Solid Matte Pastel Pink Button in Minimalist Style */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 mt-2 bg-[#FF7DA0] hover:bg-[#FF6B92] text-white rounded-2xl font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.96] uppercase tracking-widest text-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  LOADING...
                </>
              ) : (
                "LOGIN"
              )}
            </button>
          </form>

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
