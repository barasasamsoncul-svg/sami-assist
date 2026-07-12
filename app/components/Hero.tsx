export default function Hero() {
  return (
    <section className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-16 px-8 py-24 lg:flex-row">
      {/* Left Side */}
      <div className="max-w-2xl">
        <span className="rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
          AI Powered Business Workspace
        </span>

        <h1 className="mt-6 text-5xl font-bold leading-tight text-gray-900 lg:text-6xl">
          Work smarter with your own AI business assistant.
        </h1>

        <p className="mt-6 text-lg leading-8 text-gray-600">
          SaMi Assist helps businesses automate repetitive work,
          answer employee questions, organize documents,
          generate reports and increase productivity using AI.
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <button className="rounded-xl bg-blue-600 px-8 py-4 font-semibold text-white hover:bg-blue-700">
            Start Free Trial
          </button>

          <button className="rounded-xl border border-gray-300 px-8 py-4 font-semibold hover:bg-gray-100">
            Book Demo
          </button>
        </div>
      </div>

      {/* Right Side */}
      <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">
            SaMi AI
          </h3>

          <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
            Online
          </span>
        </div>

        <div className="space-y-4">
          <div className="ml-auto w-72 rounded-2xl bg-blue-600 p-4 text-white">
            Generate this month's sales summary.
          </div>

          <div className="w-80 rounded-2xl bg-gray-100 p-4 text-gray-800">
            Sales increased by 23%. The best-performing department
            was Corporate Services. Three invoices remain overdue.
          </div>

          <div className="ml-auto w-64 rounded-2xl bg-blue-600 p-4 text-white">
            Export as PDF.
          </div>

          <div className="w-52 rounded-2xl bg-gray-100 p-4 text-gray-800">
            PDF ready.
          </div>
        </div>
      </div>
    </section>
  );
}