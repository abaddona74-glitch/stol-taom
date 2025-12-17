"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback } from "react";

export default function Home() {
  const router = useRouter();
  const flyAndNavigate = useCallback(
    (href: string) => (e: any) => {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      // add fly (translate) + fade animation classes
      // use Tailwind utility classes (translate + opacity + transition)
      el.classList.add("-translate-x-500", "opacity-40", "pointer-events-none");
      el.classList.add("transition-transform", "transition-opacity", "duration-200", "ease-in");

      // navigate after transitionend (with a fallback timeout)
      let done = false;
      const navigate = () => {
        if (done) return;
        done = true;
        router.push(href);
      };
      const onEnd = (ev: TransitionEvent) => {
        // ensure it's transform or opacity transition
        if (ev.propertyName === "transform" || ev.propertyName === "opacity") navigate();
      };
      el.addEventListener("transitionend", onEnd as EventListener, { once: true });
      // fallback in case transitionend doesn't fire
      setTimeout(navigate, 400);
    },
    [router]
  );
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

          {/* 💻 DESKTOP & TABLET */}
          <div className="hidden md:flex absolute top-1/2 right-4 -translate-y-1/2 z-10 flex-col items-end gap-4">
            <Link
              href="/login"
              onClick={flyAndNavigate("/login")}
              className="flex items-center justify-end bg-[#b68c0e] text-white rounded-l-[100%] rounded-r-3xl px-8 py-3 hover:bg-[#dbbc5e] transition-colors active:translate-y-[2px] min-w-[220px]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
                className="w-6 h-6 mr-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 11v2m0 0h8m0 0l-3-3m3 3l-3 3M13 7H6a2 2 0 00-2 2v6a2 2 0 002 2h7"
                />
              </svg>
              KIRISH
            </Link>

            <Link
              href="/register"
              onClick={flyAndNavigate("/register")}
              className="flex items-center justify-end bg-[#4E6441] text-white rounded-l-[100%] rounded-r-3xl px-12 py-3 hover:bg-[#6B855A] transition-colors active:translate-y-[2px] min-w-[220px]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
                className="w-6 h-6 mr-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11a4 4 0 11-8 0 4 4 0 018 0zM6 21v-2a4 4 0 014-4h0a4 4 0 014 4v2M19 8v6M22 11h-6"
                />
              </svg>
              RO‘YHATDAN O‘TISH
            </Link>
          </div>

          {/* 📱 MOBIL (portrait) */}
          <div className="hidden max-md:portrait:flex flex-col items-center gap-4 absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
            <Link
              href="/login"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-xl font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[180px] h-[48px] px-[20px] text-[18px]"
            >
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                  className="mr-2 w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 11v2m0 0h8m0 0l-3-3m3 3l-3 3M13 7H6a2 2 0 00-2 2v6a2 2 0 002 2h7"
                  />
                </svg>
                KIRISH
              </>
            </Link>
            <Link
              href="/register"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-xl font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[180px] h-[48px] px-[20px] text-[18px] whitespace-nowrap"
            >
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                  className="mr-2 w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 11a4 4 0 11-8 0 4 4 0 018 0zM6 21v-2a4 4 0 014-4h0a4 4 0 014 4v2M19 8v6M22 11h-6"
                  />
                </svg>
                RO‘YHATDAN O‘TISH
              </>
            </Link>
          </div>

          {/* 📱 MOBIL (landscape) */}
          <div className="hidden max-md:landscape:flex flex-col items-end gap-2 absolute top-4 right-4 z-10">
            <Link
              href="/login"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-xl font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[140px] h-[42px] px-[16px] text-[16px]"
            >
              KIRISH
            </Link>
            <Link
              href="/register"
              className="bg-[#4E6441] text-white border border-[#060101] rounded-xl font-normal leading-none hover:bg-[#6B855A] transition-colors active:translate-y-[2px] select-none flex items-center justify-center text-center box-border min-w-[140px] h-[42px] px-[16px] text-[16px] whitespace-nowrap"
            >
              RO‘YHATDAN O‘TISH
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
