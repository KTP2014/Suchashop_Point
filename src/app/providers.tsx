"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { Liff } from "@line/liff";

interface LiffContextType {
  liff: Liff | null;
  isLoading: boolean;
  error: string | null;
}

const LiffContext = createContext<LiffContextType>({
  liff: null,
  isLoading: true,
  error: null,
});

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [liffInstance, setLiffInstance] = useState<Liff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initLiff = async () => {
      try {
        const liff = (await import("@line/liff")).default;
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          console.error("LIFF ID is missing in environment variables.");
          setIsLoading(false);
          return;
        }
        await liff.init({ liffId });
        setLiffInstance(liff);
        setIsLoading(false);
      } catch (err) {
        console.error("LIFF initialization failed:", err);
        setError("ไม่สามารถเชื่อมต่อ LINE LIFF ได้");
        setIsLoading(false);
      }
    };
    initLiff();
  }, []);

  return (
    <LiffContext.Provider value={{ liff: liffInstance, isLoading, error }}>
      {children}
    </LiffContext.Provider>
  );
}

export const useLiff = () => useContext(LiffContext);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LiffProvider>
      {children}
    </LiffProvider>
  );
}
