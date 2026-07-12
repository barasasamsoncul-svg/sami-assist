import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
    <Navbar />

      {/* Hero */}
      <Hero />
      {/* Features */}
    <Features/>
    </main>
  );
}