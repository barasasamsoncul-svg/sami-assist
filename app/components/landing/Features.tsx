export default function Features() {
  const features = [
    {
      title: "AI Chat Assistant",
      description:
        "Get instant answers, generate reports, and automate everyday work.",
    },
    {
      title: "Knowledge Base",
      description:
        "Upload company documents and let AI search them in seconds.",
    },
    {
      title: "Team Workspace",
      description:
        "Collaborate with your team using a secure shared workspace.",
    },
    {
      title: "Smart Automation",
      description:
        "Reduce repetitive tasks and improve productivity with AI workflows.",
    },
    {
      title: "Analytics",
      description:
        "Track usage, productivity, and business performance from one dashboard.",
    },
    {
      title: "Enterprise Security",
      description:
        "Role-based permissions and secure data management for organizations.",
    },
  ];

  return (
    <section className="bg-gray-50 py-24">
      <div className="mx-auto max-w-7xl px-8">
        <div className="text-center">
          <h2 className="text-4xl font-bold text-gray-900">
            Everything your business needs
          </h2>

          <p className="mt-4 text-lg text-gray-600">
            Powerful AI tools designed to help modern organizations work
            faster, smarter, and more efficiently.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl bg-white p-8 shadow-sm transition hover:shadow-lg"
            >
              <h3 className="text-xl font-semibold text-gray-900">
                {feature.title}
              </h3>

              <p className="mt-4 leading-7 text-gray-600">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}