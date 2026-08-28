'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sun, Moon, ArrowRight, ArrowLeft, Check, X, AlertTriangle, FileText, Shield, ChevronDown } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function TermsPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy'>('terms');
  const [overlay, setOverlay] = useState<null | { type: 'error' | 'warning'; title: string; message: string }>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('sami_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    } else {
      setDarkMode(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('sami_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('sami_theme', 'light');
    }
  };

  const handleAccept = () => {
    if (!accepted) {
      setOverlay({
        type: 'warning',
        title: 'Acceptance Required',
        message: 'Please tick the checkbox to confirm you have read and agree to the Terms of Service and Privacy Policy.',
      });
      return;
    }
    sessionStorage.setItem('sami_terms_accepted', 'true');
    router.push('/auth/select-plan');
  };

  const handleDecline = () => {
    setOverlay({
      type: 'warning',
      title: 'Terms Required',
      message: 'You must accept the Terms of Service and Privacy Policy to create an account on SaMi. Without acceptance, we cannot provide our services to you.',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4 py-12 relative">
      <button onClick={toggleTheme} className="absolute top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 z-10">
        {darkMode ? <Sun size={20} className="text-yellow-400" /> : <Moon size={20} className="text-gray-600" />}
      </button>

      <div className="max-w-3xl w-full">
        <div className="flex flex-col items-center mb-8">
          <Link href="/"><SaMiLogo size="lg" /></Link>
          <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">Terms & Privacy</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Step 3 of 4: Review and accept</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step === 3 ? 'bg-blue-600 text-white' : step < 3 ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500'
              }`}>
                {step < 3 ? <Check size={14} /> : step}
              </div>
              {step < 4 && <div className={`w-6 h-0.5 ${step < 3 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-800">
            <button
              onClick={() => setActiveTab('terms')}
              className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'terms' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText size={16} /> Terms of Service
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`flex-1 px-4 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition ${
                activeTab === 'privacy' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield size={16} /> Privacy Policy
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto p-6">
            {activeTab === 'terms' ? (
              <div className="space-y-6 text-sm text-gray-600 dark:text-gray-400">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">Terms of Service</h3>
                  <p className="text-xs text-gray-400 mb-4">Last updated: January 2026</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1. Acceptance of Terms</h4>
                  <p>By creating an account on SaMi ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service. These Terms constitute a legally binding agreement between you and SaMi Technologies ("SaMi", "we", "us", or "our").</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2. Description of Service</h4>
                  <p>SaMi is an AI-powered business workspace platform that provides business management tools including but not limited to Customer Relationship Management (CRM), Invoicing, Inventory Management, Accounting, Project Management, and AI-powered assistance. The Service is provided on a subscription basis with different plans offering varying features.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3. Account Registration</h4>
                  <p>To access the Service, you must create an account by providing accurate, current, and complete information. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorized use of your account.</p>
                  <p className="mt-2">You must be at least 18 years old to create an account. By creating an account, you represent and warrant that you meet this age requirement.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4. Subscription and Billing</h4>
                  <p>The Service offers different subscription plans including a Free plan and paid plans (Standard and Custom). Paid plans are billed on a per-user basis. Free trials may be offered for paid plans. After the trial period, your payment method will be charged automatically unless you cancel before the trial ends.</p>
                  <p className="mt-2">You may upgrade, downgrade, or cancel your subscription at any time through the Settings section. Cancellation will take effect at the end of the current billing period.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">5. Acceptable Use</h4>
                  <p>You agree NOT to:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Use the Service for any illegal or unauthorized purpose</li>
                    <li>Violate any laws in your jurisdiction</li>
                    <li>Transmit any malware, viruses, or harmful code</li>
                    <li>Attempt to gain unauthorized access to other users' data</li>
                    <li>Interfere with or disrupt the Service or its servers</li>
                    <li>Scrape, crawl, or data mine without written permission</li>
                    <li>Resell or sublicense the Service without authorization</li>
                    <li>Use the Service to store or transmit infringing content</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">6. Data and Privacy</h4>
                  <p>Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of information as described in the Privacy Policy. We implement reasonable security measures to protect your data but cannot guarantee absolute security.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">7. Intellectual Property</h4>
                  <p>All content, software, designs, logos, and materials provided by SaMi are the property of SaMi Technologies and are protected by intellectual property laws. You retain ownership of your business data. We do not claim ownership of your content.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">8. AI Services</h4>
                  <p>SaMi provides AI-powered features. AI responses are generated by machine learning models and may not always be accurate. You should verify important information before relying on AI-generated content. AI features are provided "as is" without warranty of accuracy.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">9. Termination</h4>
                  <p>We reserve the right to suspend or terminate your account if you violate these Terms. You may terminate your account at any time through the Settings section. Upon termination, your data may be deleted after a grace period as described in our Privacy Policy.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">10. Limitation of Liability</h4>
                  <p>To the maximum extent permitted by law, SaMi Technologies shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service. The Service is provided "as is" without warranties of any kind.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">11. Changes to Terms</h4>
                  <p>We may update these Terms from time to time. We will notify you of material changes via email or through the Service. Your continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">12. Contact</h4>
                  <p>For questions about these Terms, contact us at: <span className="text-blue-600">legal@sami.tech</span></p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-sm text-gray-600 dark:text-gray-400">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">Privacy Policy</h3>
                  <p className="text-xs text-gray-400 mb-4">Last updated: January 2026</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">1. Information We Collect</h4>
                  <p>We collect information you provide directly:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Account information (name, email, phone)</li>
                    <li>Business information (business name, address, industry)</li>
                    <li>Payment information (processed securely by PesaPal)</li>
                    <li>Business data you enter into the Service</li>
                  </ul>
                  <p className="mt-2">We also collect automatically:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Usage data (pages visited, features used)</li>
                    <li>Device information (browser, OS, IP address)</li>
                    <li>AI usage data (queries, tokens)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">2. How We Use Your Information</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>To provide and maintain the Service</li>
                    <li>To process payments and manage subscriptions</li>
                    <li>To send important notifications (security, billing)</li>
                    <li>To improve our services and develop new features</li>
                    <li>To provide customer support</li>
                    <li>To ensure security and prevent fraud</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">3. Data Storage and Security</h4>
                  <p>Your data is stored in isolated databases per workspace. We implement industry-standard security measures including encryption in transit and at rest. However, no method of transmission over the internet is 100% secure.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">4. Data Sharing</h4>
                  <p>We do NOT sell your personal data. We may share data with:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Payment processors (PesaPal) for billing</li>
                    <li>Email service providers for sending notifications</li>
                    <li>AI providers (Groq) for AI features</li>
                    <li>Legal authorities when required by law</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">5. Data Retention</h4>
                  <p>We retain your data as long as your account is active. Upon account deletion, we retain data for 30 days (grace period) before permanent deletion. Some data may be retained for legal or audit purposes.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">6. Your Rights</h4>
                  <p>You have the right to:</p>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>Access your personal data</li>
                    <li>Correct inaccurate data</li>
                    <li>Export your data</li>
                    <li>Delete your account and data</li>
                    <li>Opt out of marketing communications</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">7. AI and Your Data</h4>
                  <p>When you use AI features, your queries may be sent to AI providers for processing. AI providers are contractually obligated to not use your data for training their models. AI does not have access to data you are not authorized to access.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">8. Cookies</h4>
                  <p>We use essential cookies for authentication and session management. We may use analytics cookies to understand how the Service is used. You can control cookies through your browser settings.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">9. International Data Transfers</h4>
                  <p>Your data may be processed in countries other than your own. By using the Service, you consent to such transfers. We ensure appropriate safeguards are in place.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">10. Contact</h4>
                  <p>For privacy questions, contact us at: <span className="text-blue-600">privacy@sami.tech</span></p>
                </div>
              </div>
            )}
          </div>

          {/* Checkbox */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-800">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="h-5 w-5 mt-0.5 accent-blue-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                I have read, understood, and agree to the{' '}
                <span className="text-blue-600 hover:underline cursor-pointer" onClick={() => setActiveTab('terms')}>Terms of Service</span>
                {' '}and{' '}
                <span className="text-blue-600 hover:underline cursor-pointer" onClick={() => setActiveTab('privacy')}>Privacy Policy</span>.
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="p-6 flex gap-3">
            <button
              onClick={() => router.back()}
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-1"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-1 hover:bg-blue-700 transition"
            >
              Accept & Continue
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          By continuing, you agree to our Terms and Privacy Policy.
        </p>
      </div>

      {/* OVERLAY */}
      {overlay && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 shadow-2xl max-w-sm w-full text-center relative">
            <button onClick={() => setOverlay(null)} className="absolute top-4 right-4 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={18} className="text-gray-500" />
            </button>
            <div className="h-14 w-14 bg-yellow-100 dark:bg-yellow-900/20 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle size={28} className="text-yellow-600" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{overlay.title}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{overlay.message}</p>
            <button onClick={() => setOverlay(null)} className="mt-5 w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}