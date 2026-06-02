import Image from "next/image";
import { Fira_Code } from "next/font/google";
import AuthForm from "./components/AuthForm";

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center relative overflow-hidden">
      <div className="absolute top-[-120px] left-[-120px] h-[420px] w-[420px] rounded-full bg-orange-500/25 blur-3xl animate-blob-one" />
      <div className="absolute bottom-[-140px] right-[-120px] h-[460px] w-[460px] rounded-full bg-yellow-500/20 blur-3xl animate-blob-two" />
      <div className="absolute top-[35%] right-[18%] h-[260px] w-[260px] rounded-full bg-orange-700/20 blur-3xl animate-blob-three" />

      <section className="relative z-10 flex flex-col items-center px-6">
        <div className="animate-fade-in text-center">
          <Image
            src="/korban-triangle.png"
            alt="KORBAN triangle logo"
            width={72}
            height={72}
            className="mx-auto mb-5 drop-shadow-[0_0_35px_rgba(249,115,22,0.45)]"
            priority
          />

          <h1 className="text-7xl md:text-8xl font-bold tracking-[0.32em] text-orange-500 drop-shadow-[0_0_35px_rgba(249,115,22,0.25)]">
            KORBAN
          </h1>

          <p className="mt-5 text-xl md:text-2xl text-neutral-300">
            The Scaffold Estimator
          </p>

          <p className={`mt-2 text-sm uppercase tracking-[0.35em] text-orange-400/80 ${firaCode.className}`}>
            Upload • Takeoff • Estimate
          </p>
        </div>

        <div className="mt-11 w-full max-w-[340px] rounded-2xl border border-orange-500/25 bg-black/65 p-6 backdrop-blur-xl shadow-[0_0_50px_rgba(249,115,22,0.10)] animate-card-rise">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Welcome Back</h2>
            <p className={`mt-1 text-xs text-neutral-400 ${firaCode.className}`}>
              Sign in to access takeoff dashboard.
            </p>
          </div>

          <AuthForm />
        </div>
      </section>

      <style>{`
        @keyframes fadeIn {
          0% { opacity: 0; transform: translateY(18px) scale(0.98); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes cardRise {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }

        @keyframes blobOne {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(70px, 45px) scale(1.08); }
        }

        @keyframes blobTwo {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-65px, -55px) scale(1.12); }
        }

        @keyframes blobThree {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-35px, 40px) scale(1.05); }
        }

        .animate-fade-in { animation: fadeIn 1.2s ease-out forwards; }
        .animate-card-rise { animation: cardRise 1s ease-out 0.45s both; }
        .animate-blob-one { animation: blobOne 14s ease-in-out infinite; }
        .animate-blob-two { animation: blobTwo 18s ease-in-out infinite; }
        .animate-blob-three { animation: blobThree 16s ease-in-out infinite; }
      `}</style>
    </main>
  );
}