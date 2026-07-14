export default function Hero() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-16 px-8 py-24 lg:flex-row">
      {/* Left Side */}
      <div className="max-w-2xl">
        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
          AI Powered Business Workspace
        </span>

        <h1 className="mt-6 text-5xl font-extrabold leading-tight tracking-tight text-gray-900 lg:text-7xl">
          The AI teammate your business has been waiting for.
        </h1>

        <p className="mt-8 max-w-2xl text-xl leading-9 text-gray-600">
          Empower your team with AI that understands your business. Search
          documents instantly, automate repetitive tasks, generate professional
          reports, and boost productivity—all from one secure workspace.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <button className="rounded-xl bg-blue-600 px-8 py-4 font-semibold text-white transition hover:bg-blue-700">
            Start Free Trial
          </button>

          <button className="rounded-xl border border-gray-300 px-8 py-4 font-semibold transition hover:bg-gray-100">
            Book Demo
          </button>
        </div>

        {/* Statistics */}
        <div className="mt-12 flex flex-wrap gap-10">
          <div>
            <h3 className="text-3xl font-bold text-gray-900">99.9%</h3>
            <p className="text-gray-600">Platform Uptime</p>
          </div>

          <div>
            <h3 className="text-3xl font-bold text-gray-900">&lt;2 sec</h3>
            <p className="text-gray-600">AI Response</p>
          </div>

          <div>
            <h3 className="text-3xl font-bold text-gray-900">24/7</h3>
            <p className="text-gray-600">Availability</p>
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gray-50 px-6 py-4">
          <div>
            <h3 className="font-bold text-gray-900">
              SaMi AI Assistant
            </h3>

            <p className="text-sm text-gray-500">
              Connected to your workspace
            </p>
          </div>

          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            ● Online
          </span>
        </div>

        {/* Conversation */}
        <div className="space-y-5 p-6">
          <div className="ml-auto max-w-xs rounded-2xl bg-blue-600 p-4 text-white">
            Summarize this month's sales performance.
          </div>

          <div className="max-w-sm rounded-2xl bg-gray-100 p-4 text-gray-800">
            Sales increased by <strong>23%</strong> this month. Revenue was
            driven mainly by Corporate Services. Five invoices remain
            outstanding.
          </div>

          <div className="ml-auto max-w-xs rounded-2xl bg-blue-600 p-4 text-white">
            Generate an executive report.
          </div>

          <div className="max-w-sm rounded-2xl bg-gray-100 p-4 text-gray-800">
            <p className="font-semibold text-green-600">
              ✅ Executive report generated successfully.
            </p>

            <ul className="mt-3 list-disc pl-5 text-sm">
              <li>Revenue Summary</li>
              <li>Department Performance</li>
              <li>Outstanding Invoices</li>
              <li>Recommendations</li>
            </ul>
          </div>
        </div>

        {/* Input */}
        <div className="border-t bg-gray-50 p-4">
          <div className="rounded-xl border bg-white px-4 py-3 text-gray-400">
            Ask SaMi AI anything...
          </div>
        </div>
      </div>
    </section>
  );
}