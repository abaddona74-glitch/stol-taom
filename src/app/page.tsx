"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!mounted) return;
        if (res.ok) router.replace("/home");
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [router]);
  return (
    <div className="w-full min-h-screen relative overflow-hidden">
      <div className="w-full max-w-[1920px] min-h-screen mx-auto relative overflow-hidden">
        <div className="relative w-full h-screen">
          <picture className="absolute w-full h-full top-0 left-0 pointer-events-none z-0">
            <source srcSet="/background-1920.jpg" media="(min-width: 768px)" />
            <source srcSet="/mobile.jpg" media="(max-width: 767px)" />
            <img
              src="/background-1920.jpg"
              alt="Fon rasmi"
              className="w-full h-full md:object-cover max-md:object-contain max-md:w-full max-md:h-full max-md:m-auto max-md:block"
            />
          </picture>

          {/* 🖥 DESKTOP */}
          <div className="hidden md:flex absolute top-0 right-0 z-10 flex-col items-end gap-[10px] mt-[10px] mr-1">
            <Link
              href="/login"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[300px] h-[60px] px-[95px] text-[32px]"
            >
              KIRISH
            </Link>
            <Link
              href="/register"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[300px] h-[60px] px-[95px] text-[32px]"
            >
              RO‘YHATDAN O‘TISH
            </Link>
          </div>

          {/* 📱 MOBIL (portrait) */}
          <div className="hidden max-md:portrait:flex flex-col items-center gap-4 absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <Link
              href="/login"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[180px] h-[48px] px-[20px] text-[18px]"
            >
              KIRISH
            </Link>
            <Link
              href="/register"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[180px] h-[48px] px-[20px] text-[18px] whitespace-nowrap"
            >
              RO‘YHATDAN O‘TISH
            </Link>
          </div>

          {/* 📱 MOBIL (landscape) */}
          <div className="hidden max-md:landscape:flex flex-col items-end gap-2 absolute top-4 right-4 z-10">
            <Link
              href="/login"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[140px] h-[42px] px-[16px] text-[16px]"
            >
              KIRISH
            </Link>
            <Link
              href="/register"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-[12px] font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[140px] h-[42px] px-[16px] text-[16px] whitespace-nowrap"
            >
              RO‘YHATDAN O‘TISH
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
