'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sun, Moon, ArrowLeft, Shield } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function PrivacyPage() {
  const router = useRouter();
  const [darkMode, setDarkMode] = useState(false);

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

  return (
    <main className="min-h-screen bg-[#f8f9fa] dark:bg-[#0b0d10] flex flex-col justify-center px-5 py-10 transition-colors duration-200">
      <button onClick={toggleTheme} className="fixed top-5 right-5 z-20 h-10 w-10 rounded-full flex items-center justify-center border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm">
        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="w-full max-w-[820px] mx-auto">
        <section className="bg-white dark:bg-[#111418] border border-gray-200 dark:border-gray-800 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)] overflow-hidden">
          <div className="px-8 py-8 sm:px-10 sm:py-9">
            {/* Brand */}
            <div className="mb-7 flex items-center justify-between">
              <Link href="/" className="inline-flex flex-col items-start">
                <SaMiLogo size="lg" />
                <span className="mt-2 text-[12px] text-gray-500 dark:text-gray-400 tracking-wide">AI-powered business workspace</span>
              </Link>
              <button onClick={() => router.back()} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
                <ArrowLeft size={15} /> Back
              </button>
            </div>

            {/* Header */}
            <div className="mb-7">
              <div className="flex items-center gap-3 mb-2">
                <Shield size={24} className="text-blue-600" />
                <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Privacy Policy</h1>
              </div>
              <p className="text-[12px] text-gray-400">Last updated: January 2026</p>
            </div>

            {/* Content */}
            <div className="space-y-7 text-[14px] text-gray-600 dark:text-gray-400 leading-relaxed max-h-[500px] overflow-y-auto pr-3">
              
              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">1. Introduction</h2>
                <p>This Privacy Policy explains how SaMi Technologies ("SaMi", "we", "us", or "our") collects, uses, stores, shares, and protects your personal information when you use our Service.</p>
                <p className="mt-2">We are committed to protecting your privacy and handling your data transparently and securely. This policy applies to all users of the Service.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">2. Information We Collect</h2>
                
                <p className="font-medium text-gray-800 dark:text-gray-200 mt-3">2.1 Information You Provide:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Account Information:</strong> First name, last name, email address, phone number, password (hashed)</li>
                  <li><strong>Business Information:</strong> Business name, address, industry, business type, registration number, tax ID</li>
                  <li><strong>Payment Information:</strong> Billing address, payment method details (processed securely by PesaPal - we do not store card numbers)</li>
                  <li><strong>Business Data:</strong> Customers, invoices, products, employees, and other data you enter into the Service</li>
                  <li><strong>Communications:</strong> Messages sent to our support team</li>
                </ul>

                <p className="font-medium text-gray-800 dark:text-gray-200 mt-3">2.2 Information Collected Automatically:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Usage Data:</strong> Pages visited, features used, actions taken, time spent</li>
                  <li><strong>Device Information:</strong> Browser type, operating system, device type, IP address</li>
                  <li><strong>Session Data:</strong> Login times, session duration, session tokens (hashed)</li>
                  <li><strong>AI Usage Data:</strong> Queries made, tokens used, AI conversations</li>
                  <li><strong>Log Data:</strong> Server logs, error logs, audit logs</li>
                </ul>

                <p className="font-medium text-gray-800 dark:text-gray-200 mt-3">2.3 Information from Third Parties:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Google OAuth:</strong> If you sign in with Google, we receive your name, email, and profile picture</li>
                  <li><strong>Payment Providers:</strong> Transaction confirmation from PesaPal</li>
                  <li><strong>Email Providers:</strong> Delivery status from email service</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">3. How We Use Your Information</h2>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>To Provide the Service:</strong> Create and manage your account, process transactions, provide customer support</li>
                  <li><strong>To Improve the Service:</strong> Analyze usage patterns, identify bugs, develop new features</li>
                  <li><strong>To Send Notifications:</strong> Security alerts, billing updates, product announcements</li>
                  <li><strong>To Ensure Security:</strong> Detect and prevent fraud, abuse, and unauthorized access</li>
                  <li><strong>To Process Payments:</strong> Manage subscriptions, process transactions</li>
                  <li><strong>To Comply with Law:</strong> Respond to legal requests, enforce our Terms</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">4. Data Storage and Security</h2>
                <p>Your data is stored in isolated databases. Each workspace has its own dedicated database, ensuring complete data isolation between customers.</p>
                <p className="mt-2">Security measures we implement:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Encryption in Transit:</strong> All data transmitted over HTTPS/TLS</li>
                  <li><strong>Encryption at Rest:</strong> Data stored in encrypted databases</li>
                  <li><strong>Secure Password Hashing:</strong> bcrypt with 12 rounds</li>
                  <li><strong>Two-Factor Authentication:</strong> TOTP and email-based 2FA</li>
                  <li><strong>Session Management:</strong> Session tokens hashed with SHA-256</li>
                  <li><strong>Access Controls:</strong> Role-based access control (RBAC)</li>
                  <li><strong>Audit Logging:</strong> All important actions logged</li>
                  <li><strong>Isolated Databases:</strong> Each workspace has its own database</li>
                </ul>
                <p className="mt-2">While we implement strong security measures, no method of transmission or storage is 100% secure. We cannot guarantee absolute security.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">5. Data Sharing and Disclosure</h2>
                <p>We do NOT sell, rent, or trade your personal data. We may share data with:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Payment Processors (PesaPal):</strong> To process payments and manage subscriptions</li>
                  <li><strong>Email Service Providers:</strong> To send transactional emails (verification, notifications)</li>
                  <li><strong>AI Providers (Groq):</strong> To process AI queries</li>
                  <li><strong>Cloud Hosting (Neon, Vercel):</strong> To host and run the Service</li>
                  <li><strong>Legal Authorities:</strong> When required by law or to protect our rights</li>
                </ul>
                <p className="mt-2">These providers are contractually obligated to protect your data and not use it for their own purposes.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">6. AI and Your Data</h2>
                <p>SaMi provides AI-powered features. When you use AI features:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Your queries are sent to AI providers (Groq) for processing</li>
                  <li>AI providers do NOT use your data for training their models</li>
                  <li>AI respects your permissions - it cannot access data you cannot access</li>
                  <li>AI conversations are stored in your workspace database</li>
                  <li>AI usage is tracked per workspace and user</li>
                  <li>AI execution is logged for audit purposes</li>
                </ul>
                <p className="mt-2">You are responsible for the data you share with AI. Do not share sensitive information you are not authorized to share.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">7. Data Retention</h2>
                <p>We retain your data as long as your account is active. When you delete your account:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Grace Period:</strong> 30 days before permanent deletion</li>
                  <li><strong>Cancellation:</strong> You can cancel deletion during grace period</li>
                  <li><strong>Permanent Deletion:</strong> After grace period, all data permanently deleted</li>
                  <li><strong>Legal Retention:</strong> Some data may be retained for legal compliance</li>
                  <li><strong>Audit Logs:</strong> May be retained for security and compliance</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">8. Your Rights</h2>
                <p>You have the right to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Access:</strong> Request a copy of your personal data</li>
                  <li><strong>Correction:</strong> Update inaccurate data</li>
                  <li><strong>Export:</strong> Download your data (via Settings → Export Data)</li>
                  <li><strong>Deletion:</strong> Request account deletion</li>
                  <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
                  <li><strong>Withdraw Consent:</strong> At any time</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">9. Cookies and Tracking</h2>
                <p>We use essential cookies for:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Session Management:</strong> Keeping you logged in</li>
                  <li><strong>Theme Preference:</strong> Light/dark mode selection</li>
                  <li><strong>Security:</strong> CSRF protection</li>
                </ul>
                <p className="mt-2">We do not use tracking cookies or third-party advertising cookies. We do not sell cookie data.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">10. International Data Transfers</h2>
                <p>Your data may be processed in countries other than your own, including the United States and other jurisdictions. By using the Service, you consent to such transfers.</p>
                <p className="mt-2">We ensure appropriate safeguards are in place and comply with applicable data protection laws.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">11. Children's Privacy</h2>
                <p>SaMi is not intended for children under 18 years of age. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us immediately.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">12. Google OAuth</h2>
                <p>If you sign in with Google:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>We receive your name, email, and profile picture</li>
                  <li>Google's use of your data is governed by Google's Privacy Policy</li>
                  <li>You can revoke access through your Google account settings</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">13. Data Breach Notification</h2>
                <p>In the event of a data breach affecting your personal data, we will notify you within 72 hours of discovery via email. We will describe the nature of the breach and steps we are taking.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">14. Changes to This Policy</h2>
                <p>We may update this Privacy Policy from time to time. We will notify you of material changes via:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Email notification</li>
                  <li>In-app notification</li>
                  <li>Posting on our website</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">15. Contact Us</h2>
                <p>For privacy questions or concerns, contact us at:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Email: <span className="text-blue-600">privacy@sami.tech</span></li>
                  <li>Website: <span className="text-blue-600">www.sami.tech</span></li>
                </ul>
              </section>

            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/terms" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Terms</Link>
        </div>
      </div>
    </main>
  );
}