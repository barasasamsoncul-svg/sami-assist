const features = [
  {
    number: "01",
    title: "Business apps in one workspace",
    description:
      "Choose the applications your business needs, from accounting and invoicing to CRM, inventory, manufacturing and projects.",
  },
  {
    number: "02",
    title: "AI that understands your workspace",
    description:
      "Give your AI teammate access to the business context it needs to answer questions, summarize information and help with work.",
  },
  {
    number: "03",
    title: "Connected business workflows",
    description:
      "Reduce repetitive work by connecting information and processes across the applications your business uses.",
  },
  {
    number: "04",
    title: "Built for teams",
    description:
      "Create a business workspace where owners, managers and team members can work with appropriate access and permissions.",
  },
  {
    number: "05",
    title: "Business data stays organized",
    description:
      "Keep your business information structured inside dedicated application data and workspace infrastructure.",
  },
  {
    number: "06",
    title: "Grow without rebuilding",
    description:
      "Start with the apps you need today and expand your workspace as your business operations become more complex.",
  },
];

export default function Features() {
  return (
    <section
      id="features"
      className="border-t border-gray-100 bg-gray-50 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Heading */}
        <div className="max-w-3xl">
          <span className="inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm ring-1 ring-gray-200">
            Everything in one place
          </span>

          <h2 className="mt-5 text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
            Your business has many moving parts.
            <span className="block text-blue-600">
              SaMi brings them together.
            </span>
          </h2>

          <p className="mt-5 text-lg leading-8 text-gray-600">
            SaMi combines business applications with an AI-powered workspace
            so your team can manage work, information and operations without
            constantly switching between disconnected systems.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-gray-200 bg-gray-200 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <article
              key={feature.number}
              className="group bg-white p-8 transition hover:bg-gray-50 sm:p-10"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-600">
                  {feature.number}
                </span>

                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition group-hover:border-blue-200 group-hover:bg-blue-50 group-hover:text-blue-600">
                  →
                </span>
              </div>

              <h3 className="mt-8 text-xl font-bold text-gray-950">
                {feature.title}
              </h3>

              <p className="mt-4 text-sm leading-7 text-gray-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        {/* App ecosystem */}
        <div className="mt-20 rounded-3xl bg-gray-950 p-8 text-white sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-sm font-semibold text-blue-400">
                THE SAmi APP ECOSYSTEM
              </p>

              <h3 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Pick the tools your business actually needs.
              </h3>

              <p className="mt-4 leading-7 text-gray-400">
                From finance and sales to manufacturing, people management
                and work management, your workspace can grow with your
                business.
              </p>

              <a
                href="/auth/register"
                className="mt-7 inline-flex rounded-xl bg-white px-6 py-3 font-semibold text-gray-950 transition hover:bg-gray-100"
              >
                Build your workspace
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                "Accounting",
                "Invoicing",
                "CRM",
                "Sales",
                "Inventory",
                "Manufacturing",
                "Employees",
                "Projects",
                "Helpdesk",
              ].map((app) => (
                <div
                  key={app}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-4 text-sm font-medium text-gray-200"
                >
                  {app}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}