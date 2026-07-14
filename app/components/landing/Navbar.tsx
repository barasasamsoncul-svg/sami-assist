import Image from "next/image";
export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-gray-200/50 bg-white/80 backdrop-blur-lg">
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="SaMi Technologies"
            width={80}
            height={80}
            className="h-20 w-20 object-contain"
          />

          <div>
            <h1 className="text-xl font-bold text-gray-900">
              SaMi Assist
            </h1>

            <p className="text-xs text-gray-500">
              by SaMi Technologies
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#" className="font-medium text-blue-600">
            Home
          </a>

          <a
            href="#features"
            className="text-gray-600 transition hover:text-black"
          >
            Features
          </a>

          <a
            href="#pricing"
            className="text-gray-600 transition hover:text-black"
          >
            Pricing
          </a>

          <a
            href="#about"
            className="text-gray-600 transition hover:text-black"
          >
            About
          </a>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          <button className="rounded-lg px-5 py-2 font-medium text-gray-700 transition hover:bg-gray-100">
            Sign In
          </button>

          <button className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:bg-blue-700">
            Start Free
          </button>
        </div>
      </nav>
    </header>
  );
}