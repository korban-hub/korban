export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-black text-white flex">

      {/* Sidebar */}
      <aside className="w-[260px] border-r border-orange-500/20 bg-black/60 backdrop-blur-xl p-6">

        <h1 className="text-3xl font-bold tracking-[0.25em] text-orange-500">
          KORBAN
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Scaffold Estimator
        </p>

        <nav className="mt-12 flex flex-col gap-3">

          <button className="rounded-xl bg-orange-500 px-4 py-3 text-left font-semibold text-black">
            Dashboard
          </button>

          <button className="rounded-xl border border-neutral-800 px-4 py-3 text-left text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">
            Projects
          </button>

          <button className="rounded-xl border border-neutral-800 px-4 py-3 text-left text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">
            Estimates
          </button>

          <button className="rounded-xl border border-neutral-800 px-4 py-3 text-left text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">
            Materials
          </button>

          <button className="rounded-xl border border-neutral-800 px-4 py-3 text-left text-neutral-300 transition hover:border-orange-500/40 hover:bg-orange-500/10">
            Labor
          </button>

        </nav>

      </aside>

      {/* Main Content */}
      <section className="flex-1 p-10">

        <div className="flex items-center justify-between">

          <div>
            <h2 className="text-4xl font-bold">
              Dashboard
            </h2>

            <p className="mt-2 text-neutral-500">
              Welcome to KORBAN estimating platform.
            </p>
          </div>

          <button className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-black transition hover:bg-orange-400">
            + New Project
          </button>

        </div>

        {/* Dashboard Cards */}
        <div className="mt-10 grid grid-cols-3 gap-6">

          <div className="rounded-3xl border border-orange-500/20 bg-black/50 p-6">
            <p className="text-sm text-neutral-500">
              Active Projects
            </p>

            <h3 className="mt-4 text-5xl font-bold text-orange-500">
              12
            </h3>
          </div>

          <div className="rounded-3xl border border-orange-500/20 bg-black/50 p-6">
            <p className="text-sm text-neutral-500">
              Estimates This Month
            </p>

            <h3 className="mt-4 text-5xl font-bold text-orange-500">
              28
            </h3>
          </div>

          <div className="rounded-3xl border border-orange-500/20 bg-black/50 p-6">
            <p className="text-sm text-neutral-500">
              Estimated Scaffold LF
            </p>

            <h3 className="mt-4 text-5xl font-bold text-orange-500">
              14K
            </h3>
          </div>

        </div>

      </section>

    </main>
  )
}
