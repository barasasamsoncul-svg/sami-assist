import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/70 bg-white/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 lg:px-8">
        {/* Brand */}
        <Link
          href="/"
          className="group flex items-center gap-3"
          aria-label="SaMi Technologies home"
        >
          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={56}
            height={56}
            priority
            className="h-14 w-14 object-contain transition-transform group-hover:scale-105"
          />

          <div className="hidden sm:block">
            <p className="text-lg font-bold tracking-tight text-gray-950">
              SaMi
            </p>

            <p className="text-xs text-gray-500">
              AI-powered business workspace
            </p>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-8 md:flex">
          <Link
            href="/"
            className="font-medium text-blue-600"
          >
            Home
          </Link>

          <Link
            href="/#features"
            className="font-medium text-gray-600 transition hover:text-gray-950"
          >
            Features
          </Link>

          <Link
            href="/#pricing"
            className="font-medium text-gray-600 transition hover:text-gray-950"
          >
            Pricing
          </Link>

          <Link
            href="/#about"
            className="font-medium text-gray-600 transition hover:text-gray-950"
          >
            About
          </Link>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/auth/login"
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 hover:text-gray-950 sm:px-5"
          >
            Sign In
          </Link>

          <Link
            href="/auth/register"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 hover:shadow-blue-600/30 sm:px-6"
          >
            Start Free
          </Link>
        </div>
      </nav>
    </header>
  );
}