import Navbar from "./components/landing/Navbar";
import Hero from "./components/landing/Hero";
import Features from "./components/landing/Features";
import Footer from "./components/landing/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Navbar />

      <main>
        <Hero />
        <Features />

        {/* Pricing */}
        <section
          id="pricing"
          className="border-t border-gray-100 bg-white py-24"
        >
          <div className="mx-auto max-w-7xl px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">
                Simple pricing
              </span>

              <h2 className="mt-5 text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
                Start free. Grow when your business grows.
              </h2>

              <p className="mt-5 text-lg leading-8 text-gray-600">
                Start with the tools your business needs and expand your
                workspace as your team and operations grow.
              </p>
            </div>

            <div className="mx-auto mt-14 grid max-w-5xl gap-8 lg:grid-cols-2">
              {/* Free */}
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <div>
                  <h3 className="text-2xl font-bold text-gray-950">
                    Free
                  </h3>

                  <p className="mt-2 text-gray-600">
                    A simple way to start building your workspace.
                  </p>
                </div>

                <div className="mt-8 flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-gray-950">
                    $0
                  </span>

                  <span className="pb-1 text-gray-500">
                    /month
                  </span>
                </div>

                <ul className="mt-8 space-y-4 text-sm text-gray-700">
                  <li>✓ Business workspace</li>
                  <li>✓ SaMi AI workspace</li>
                  <li>✓ Selected business apps</li>
                  <li>✓ Team-ready architecture</li>
                </ul>

                <a
                  href="/auth/register"
                  className="mt-8 block rounded-xl border border-gray-300 px-5 py-3 text-center font-semibold text-gray-900 transition hover:bg-gray-50"
                >
                  Start Free
                </a>
              </div>

              {/* Business */}
              <div className="relative rounded-3xl border border-blue-600 bg-gray-950 p-8 text-white shadow-xl">
                <span className="absolute right-6 top-6 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold">
                  For growing teams
                </span>

                <h3 className="text-2xl font-bold">
                  Business
                </h3>

                <p className="mt-2 max-w-sm text-gray-300">
                  A complete workspace for businesses that need more
                  automation and control.
                </p>

                <div className="mt-8">
                  <span className="text-4xl font-extrabold">
                    Custom
                  </span>
                </div>

                <ul className="mt-8 space-y-4 text-sm text-gray-200">
                  <li>✓ Multiple business apps</li>
                  <li>✓ Team collaboration</li>
                  <li>✓ Advanced business workflows</li>
                  <li>✓ Business-focused AI automation</li>
                </ul>

                <a
                  href="/auth/register"
                  className="mt-8 block rounded-xl bg-white px-5 py-3 text-center font-semibold text-gray-950 transition hover:bg-gray-100"
                >
                  Get Started
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section
          id="about"
          className="border-t border-gray-100 bg-gray-50 py-24"
        >
          <div className="mx-auto grid max-w-7xl gap-12 px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <span className="inline-flex rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-700">
                About SaMi
              </span>

              <h2 className="mt-5 text-4xl font-bold tracking-tight text-gray-950 sm:text-5xl">
                One workspace for the way your business actually works.
              </h2>
            </div>

            <div className="space-y-6 text-lg leading-8 text-gray-600">
              <p>
                SaMi is designed to bring business applications and AI
                together in one workspace instead of forcing teams to work
                across disconnected systems.
              </p>

              <p>
                Your business can choose the applications it needs, while
                SaMi provides the workspace and infrastructure that connects
                those applications together.
              </p>

              <p>
                The goal is simple: help businesses spend less time moving
                information between tools and more time getting meaningful
                work done.
              </p>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}