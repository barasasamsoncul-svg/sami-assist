export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-8 py-10 md:flex-row">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            SaMi Assist
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            AI business assistant by SaMi Technologies.
          </p>
        </div>

        <div className="flex gap-6 text-sm text-gray-600">
          <a href="#" className="hover:text-blue-600">
            Privacy
          </a>

          <a href="#" className="hover:text-blue-600">
            Terms
          </a>

          <a href="#" className="hover:text-blue-600">
            Contact
          </a>
        </div>

        <p className="text-sm text-gray-500">
          © 2026 SaMi Technologies. All rights reserved.
        </p>
      </div>
    </footer>
  );
}