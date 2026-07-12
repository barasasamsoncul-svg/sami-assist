export default function Navbar() {
  return (
    <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        SaMi Assist
      </h1>

      <div className="flex items-center gap-8">
        <a href="#" className="text-gray-600 hover:text-black">
          Features
        </a>

        <a href="#" className="text-gray-600 hover:text-black">
          Pricing
        </a>

        <a href="#" className="text-gray-600 hover:text-black">
          About
        </a>

        <button className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700">
          Get Started
        </button>
      </div>
    </nav>
  );
}