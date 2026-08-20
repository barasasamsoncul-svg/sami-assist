import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link
              href="/"
              className="text-2xl font-extrabold tracking-tight text-gray-950"
            >
              SaMi
            </Link>

            <p className="mt-4 max-w-md text-sm leading-7 text-gray-600">
              An AI-powered business workspace that brings your applications,
              business information and workflows together.
            </p>

            <p className="mt-6 text-xs text-gray-400">
              A SaMi Technologies product.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-gray-950">
              Product
            </h3>

            <ul className="mt-5 space-y-3 text-sm text-gray-600">
              <li>
                <Link
                  href="/#features"
                  className="transition hover:text-blue-600"
                >
                  Features
                </Link>
              </li>

              <li>
                <Link
                  href="/#pricing"
                  className="transition hover:text-blue-600"
                >
                  Pricing
                </Link>
              </li>

              <li>
                <Link
                  href="/auth/register"
                  className="transition hover:text-blue-600"
                >
                  Start Free
                </Link>
              </li>

              <li>
                <Link
                  href="/auth/login"
                  className="transition hover:text-blue-600"
                >
                  Sign In
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-gray-950">
              Company
            </h3>

            <ul className="mt-5 space-y-3 text-sm text-gray-600">
              <li>
                <Link
                  href="/#about"
                  className="transition hover:text-blue-600"
                >
                  About
                </Link>
              </li>

              <li>
                <a
                  href="mailto:hello@sami.tech"
                  className="transition hover:text-blue-600"
                >
                  Contact
                </a>
              </li>

              <li>
                <a
                  href="mailto:hello@sami.tech?subject=Privacy%20Question"
                  className="transition hover:text-blue-600"
                >
                  Privacy
                </a>
              </li>

              <li>
                <a
                  href="mailto:hello@sami.tech?subject=Terms%20Question"
                  className="transition hover:text-blue-600"
                >
                  Terms
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-gray-200 pt-8 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} SaMi Technologies. All rights
            reserved.
          </p>

          <p>
            AI-powered business workspace.
          </p>
        </div>
      </div>
    </footer>
  );
}