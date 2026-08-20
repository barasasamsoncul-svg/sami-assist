import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Background decoration */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-0 -z-10 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-50/70 blur-3xl"
      />

      <div className="mx-auto grid max-w-7xl gap-16 px-6 pb-24 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-32 lg:pt-28">
        {/* Left */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-600" />
            AI-powered business workspace
          </div>

          <h1 className="mt-7 max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-[-0.04em] text-gray-950 sm:text-6xl lg:text-7xl">
            Run your business with{" "}
            <span className="text-blue-600">
              AI on your side.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-gray-600 sm:text-xl">
            SaMi brings your business applications, data, workflows and AI
            together in one secure workspace—so your team can work faster
            without jumping between disconnected tools.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/register"
              className="rounded-xl bg-blue-600 px-7 py-4 text-center font-semibold text-white shadow-xl shadow-blue-600/20 transition hover:bg-blue-700"
            >
              Start Free
            </Link>

            <a
              href="mailto:hello@sami.tech?subject=SaMi%20Demo%20Request"
              className="rounded-xl border border-gray-300 bg-white px-7 py-4 text-center font-semibold text-gray-900 transition hover:border-gray-400 hover:bg-gray-50"
            >
              Book a Demo
            </a>
          </div>

          <p className="mt-5 text-sm text-gray-500">
            Set up your workspace and choose the apps your business needs.
          </p>

          {/* Trust points */}
          <div className="mt-12 grid max-w-2xl grid-cols-1 gap-5 border-t border-gray-200 pt-8 sm:grid-cols-3">
            <div>
              <p className="text-lg font-bold text-gray-950">
                One workspace
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Apps and business data together.
              </p>
            </div>

            <div>
              <p className="text-lg font-bold text-gray-950">
                Built for teams
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Business users and permissions.
              </p>
            </div>

            <div>
              <p className="text-lg font-bold text-gray-950">
                AI-ready
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Let AI work with your business.
              </p>
            </div>
          </div>
        </div>

        {/* Right - Product Preview */}
        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-4 rounded-[2rem] bg-blue-600/10 blur-2xl" />

          <div className="relative overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-2xl shadow-gray-900/10">
            {/* Window bar */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
                <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              </div>

              <span className="text-xs font-medium text-gray-400">
                sami workspace
              </span>
            </div>

            {/* Workspace */}
            <div className="grid min-h-[500px] grid-cols-[150px_1fr]">
              {/* Sidebar */}
              <div className="border-r border-gray-100 bg-gray-50 p-4">
                <div className="mb-6 rounded-xl bg-white px-3 py-2 shadow-sm">
                  <p className="text-xs font-bold text-gray-950">
                    ACME LTD
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    Business workspace
                  </p>
                </div>

                <div className="space-y-1">
                  {[
                    "Dashboard",
                    "Accounting",
                    "Invoicing",
                    "CRM",
                    "Inventory",
                    "Projects",
                  ].map((item, index) => (
                    <div
                      key={item}
                      className={`rounded-lg px-3 py-2 text-xs font-medium ${
                        index === 0
                          ? "bg-blue-600 text-white"
                          : "text-gray-500"
                      }`}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              {/* Main */}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-400">
                      Workspace
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-gray-950">
                      Good morning 👋
                    </h3>
                  </div>

                  <div className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-semibold text-green-700">
                    AI ready
                  </div>
                </div>

                {/* Stats */}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] text-gray-400">
                      Revenue
                    </p>

                    <p className="mt-1 text-lg font-bold text-gray-950">
                      KSh 428K
                    </p>

                    <p className="mt-1 text-[10px] font-medium text-green-600">
                      ↑ 18.4%
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <p className="text-[10px] text-gray-400">
                      Outstanding
                    </p>

                    <p className="mt-1 text-lg font-bold text-gray-950">
                      KSh 72K
                    </p>

                    <p className="mt-1 text-[10px] text-gray-400">
                      5 invoices
                    </p>
                  </div>
                </div>

                {/* AI Card */}
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-bold text-white">
                      S
                    </div>

                    <div>
                      <p className="text-xs font-bold text-gray-950">
                        Ask SaMi
                      </p>

                      <p className="text-[10px] text-gray-500">
                        Your business AI teammate
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-white p-3 text-xs leading-5 text-gray-700 shadow-sm">
                    Your revenue increased this month. I found five
                    outstanding invoices and three areas where expenses can
                    be reduced.
                  </div>
                </div>

                {/* Activity */}
                <div className="mt-5">
                  <p className="text-xs font-bold text-gray-950">
                    Recent activity
                  </p>

                  <div className="mt-3 space-y-2">
                    {[
                      "Invoice INV-1042 created",
                      "Customer added to CRM",
                      "Monthly report generated",
                    ].map((activity) => (
                      <div
                        key={activity}
                        className="rounded-lg border border-gray-100 px-3 py-2 text-[10px] text-gray-500"
                      >
                        {activity}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}