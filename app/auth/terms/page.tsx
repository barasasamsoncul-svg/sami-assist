'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sun, Moon, ArrowLeft, FileText } from 'lucide-react';
import SaMiLogo from '@/app/components/SaMiLogo';

export default function TermsPage() {
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
                <FileText size={24} className="text-blue-600" />
                <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">Terms of Service</h1>
              </div>
              <p className="text-[12px] text-gray-400">Last updated: January 2026</p>
            </div>

            {/* Content */}
            <div className="space-y-7 text-[14px] text-gray-600 dark:text-gray-400 leading-relaxed max-h-[500px] overflow-y-auto pr-3">
              
              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">1. Acceptance of Terms</h2>
                <p>By creating an account, accessing, or using SaMi ("the Service"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you do not agree to these Terms, you must not access or use the Service.</p>
                <p className="mt-2">These Terms constitute a legally binding agreement between you ("you", "your", "user", or "Customer") and SaMi Technologies ("SaMi", "we", "us", or "our"). By using the Service, you represent that you have read, understood, and agree to be bound by these Terms.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">2. Description of Service</h2>
                <p>SaMi is an AI-powered business workspace platform that provides business management tools including but not limited to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Customer Relationship Management (CRM)</li>
                  <li>Invoicing and payment management</li>
                  <li>Inventory and warehouse management</li>
                  <li>Financial accounting</li>
                  <li>Project management</li>
                  <li>Employee management</li>
                  <li>AI-powered business assistance</li>
                  <li>Document management</li>
                  <li>And other business applications</li>
                </ul>
                <p className="mt-2">The Service is provided on a subscription basis with different plans offering varying features and limitations as described on our website or within the Service.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">3. Account Registration</h2>
                <p>To access the Service, you must create an account by providing accurate, current, and complete information including your name, email address, and business information.</p>
                <p className="mt-2">You are responsible for:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Maintaining the confidentiality of your account credentials</li>
                  <li>All activities that occur under your account</li>
                  <li>Ensuring your account information remains accurate and up-to-date</li>
                  <li>Notifying us immediately of any unauthorized access</li>
                </ul>
                <p className="mt-2">You must be at least 18 years old to create an account. By creating an account, you represent and warrant that you meet this age requirement and have the legal capacity to enter into these Terms.</p>
                <p className="mt-2">Each user account is personal and may not be shared or transferred. You may not create multiple accounts to circumvent subscription limits or other restrictions.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">4. Subscription Plans and Billing</h2>
                <p>SaMi offers the following subscription plans:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li><strong>Free Plan:</strong> 1 app, unlimited users, limited AI queries</li>
                  <li><strong>Standard Plan:</strong> All apps, per-user billing, increased AI queries</li>
                  <li><strong>Custom Plan:</strong> All apps plus custom features, unlimited AI</li>
                </ul>
                <p className="mt-2">Paid plans are billed on a per-user basis. Billing occurs monthly or annually as selected. Prices are displayed in Kenyan Shillings (KES) or other supported currencies.</p>
                <p className="mt-2">Free trials may be offered for paid plans. The trial period is typically 15 days. After the trial period ends, your payment method will be charged automatically unless you cancel before the trial ends.</p>
                <p className="mt-2">You may upgrade, downgrade, or cancel your subscription at any time through the Settings section. Changes take effect at the start of the next billing cycle. Downgrading may result in loss of features or data access.</p>
                <p className="mt-2">All payments are processed securely through PesaPal or other payment providers. We do not store your card details.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">5. Acceptable Use Policy</h2>
                <p>You agree NOT to use the Service to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Violate any applicable laws or regulations</li>
                  <li>Infringe on intellectual property rights of others</li>
                  <li>Transmit malware, viruses, or harmful code</li>
                  <li>Attempt to gain unauthorized access to other users' data</li>
                  <li>Interfere with or disrupt the Service or its infrastructure</li>
                  <li>Scrape, crawl, or data mine without written permission</li>
                  <li>Resell, sublicense, or redistribute the Service</li>
                  <li>Store or transmit content that is illegal, offensive, or infringing</li>
                  <li>Harass, abuse, or harm other users</li>
                  <li>Use the Service to send spam or unsolicited messages</li>
                  <li>Circumvent any security measures or access controls</li>
                  <li>Use AI features to generate harmful or illegal content</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">6. Data and Privacy</h2>
                <p>Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection, use, and storage of information as described in the Privacy Policy.</p>
                <p className="mt-2">You retain ownership of all data you enter into the Service ("Your Data"). We do not claim ownership of Your Data.</p>
                <p className="mt-2">We implement reasonable security measures including encryption, isolated databases per workspace, and access controls. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">7. Intellectual Property</h2>
                <p>All content, software, designs, logos, trademarks, and materials provided by SaMi are the property of SaMi Technologies and are protected by intellectual property laws.</p>
                <p className="mt-2">You may not copy, modify, distribute, sell, or create derivative works from SaMi's intellectual property without written permission.</p>
                <p className="mt-2">You retain full ownership of Your Data. We do not use Your Data for any purpose other than providing the Service.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">8. AI Services</h2>
                <p>SaMi provides AI-powered features ("AI Services"). By using AI Services, you acknowledge that:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>AI responses are generated by machine learning models</li>
                  <li>AI outputs may not always be accurate or complete</li>
                  <li>You should verify important information before relying on AI</li>
                  <li>AI Services are provided "as is" without warranty of accuracy</li>
                  <li>AI does not have access to data you are not authorized to access</li>
                  <li>AI usage is tracked and limited according to your subscription plan</li>
                </ul>
                <p className="mt-2">You are solely responsible for decisions made based on AI-generated content.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">9. Service Availability and Modifications</h2>
                <p>We strive to maintain high availability but do not guarantee uninterrupted service. We may:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Perform scheduled maintenance</li>
                  <li>Modify or discontinue features</li>
                  <li>Update the Service with new features</li>
                  <li>Suspend service for security reasons</li>
                </ul>
                <p className="mt-2">We will provide reasonable notice for scheduled maintenance where possible.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">10. Termination</h2>
                <p>You may terminate your account at any time through the Settings section. Upon termination:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Your data enters a 30-day grace period before permanent deletion</li>
                  <li>You may cancel termination during the grace period</li>
                  <li>Access to the Service ends immediately upon termination request</li>
                </ul>
                <p className="mt-2">We reserve the right to suspend or terminate accounts that:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Violate these Terms</li>
                  <li>Fail to pay subscription fees</li>
                  <li>Pose a security risk</li>
                  <li>Engage in illegal activities</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">11. Limitation of Liability</h2>
                <p>To the maximum extent permitted by law, SaMi Technologies shall not be liable for:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Indirect, incidental, special, consequential, or punitive damages</li>
                  <li>Loss of profits, revenue, or business opportunities</li>
                  <li>Loss of data or data corruption</li>
                  <li>Business interruption</li>
                  <li>Third-party claims</li>
                </ul>
                <p className="mt-2">The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">12. Indemnification</h2>
                <p>You agree to indemnify and hold harmless SaMi Technologies, its officers, directors, employees, and agents from any claims, damages, or expenses arising from:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Your use of the Service</li>
                  <li>Your violation of these Terms</li>
                  <li>Your violation of third-party rights</li>
                  <li>Your data or content</li>
                </ul>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">13. Governing Law</h2>
                <p>These Terms shall be governed by and construed in accordance with the laws of the Republic of Kenya. Any disputes arising from these Terms shall be subject to the exclusive jurisdiction of Kenyan courts.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">14. Changes to Terms</h2>
                <p>We may update these Terms from time to time. We will notify you of material changes via:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Email notification</li>
                  <li>In-app notification</li>
                  <li>Posting on our website</li>
                </ul>
                <p className="mt-2">Your continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">15. Severability</h2>
                <p>If any provision of these Terms is found to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">16. Entire Agreement</h2>
                <p>These Terms, together with our Privacy Policy, constitute the entire agreement between you and SaMi Technologies regarding the Service.</p>
              </section>

              <section>
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white mb-2">17. Contact Information</h2>
                <p>For questions about these Terms of Service, contact us at:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>Email: <span className="text-blue-600">legal@sami.tech</span></li>
                  <li>Website: <span className="text-blue-600">www.sami.tech</span></li>
                </ul>
              </section>

            </div>
          </div>
        </section>

        <div className="mt-4 flex justify-end items-center gap-5 px-1">
          <Link href="/help" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Help</Link>
          <Link href="/auth/privacy" className="text-[12px] text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">Privacy</Link>
        </div>
      </div>
    </main>
  );
}