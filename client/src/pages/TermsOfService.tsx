import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function TermsOfService() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: December 1, 2025</p>
          
          <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">1. Agreement to Terms</h2>
              <p>
                By accessing or using AutoFillPDF ("Service"), you agree to be bound by these Terms of Service 
                ("Terms"). If you disagree with any part of the terms, you may not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description of Service</h2>
              <p>
                AutoFillPDF is a web-based service that allows users to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Upload PDF forms (including scanned and non-fillable documents)</li>
                <li>Fill out forms through an online interface</li>
                <li>Add electronic signatures</li>
                <li>Download completed PDF documents</li>
                <li>Save profiles for autofill functionality (Pro users)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Accounts</h2>
              <p>
                <strong>Guest Users:</strong> Can use the service without an account for one-time form filling 
                at $5 per form. Files are deleted after 72 hours.
              </p>
              <p className="mt-4">
                <strong>Registered Users:</strong> Can create an account via Replit Auth to access subscription 
                features including saved profiles, autofill, and extended file retention.
              </p>
              <p className="mt-4">
                You are responsible for maintaining the confidentiality of your account and for all activities 
                under your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">4. Subscription Plans & Billing</h2>
              
              <h3 className="text-xl font-medium mt-6 mb-3">Available Plans</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Pay Per Form:</strong> $5 per form, no subscription required</li>
                <li><strong>Starter:</strong> $7/month - 2 forms, 1 profile, 30-day history</li>
                <li><strong>Pro:</strong> $15/month - 5 forms, multiple profiles, 180-day history</li>
                <li><strong>Team:</strong> $49/month - 20 forms, 5 team members, API access</li>
              </ul>

              <h3 className="text-xl font-medium mt-6 mb-3">Billing</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Subscriptions are billed monthly via Stripe</li>
                <li>Unused forms do not roll over to the next month</li>
                <li>Additional forms can be purchased at discounted rates within your plan</li>
                <li>All prices are in USD</li>
              </ul>

              <h3 className="text-xl font-medium mt-6 mb-3">Cancellation</h3>
              <p>
                You may cancel your subscription at any time. Access continues until the end of the 
                current billing period. No partial refunds for unused time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">5. Refund Policy</h2>
              <p>
                We offer a <strong>30-day money-back guarantee</strong> on all subscription plans. If you're 
                not satisfied within 30 days of your initial purchase, contact us for a full refund.
              </p>
              <p className="mt-4">
                <strong>Exceptions:</strong>
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Pay-per-form purchases are non-refundable after the PDF is generated</li>
                <li>Refunds after 30 days are at our discretion</li>
                <li>Abuse of the refund policy may result in account termination</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">6. Acceptable Use</h2>
              <p>You agree NOT to use the Service to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Upload illegal, harmful, or fraudulent content</li>
                <li>Forge documents or create false official records</li>
                <li>Impersonate others or misrepresent your identity</li>
                <li>Violate any applicable laws or regulations</li>
                <li>Attempt to circumvent security measures</li>
                <li>Upload malware, viruses, or malicious code</li>
                <li>Exceed rate limits or abuse the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">7. Intellectual Property</h2>
              <p>
                <strong>Your Content:</strong> You retain all rights to documents you upload. We do not 
                claim ownership of your files or data.
              </p>
              <p className="mt-4">
                <strong>Our Service:</strong> AutoFillPDF, its design, features, and underlying technology 
                are protected by copyright and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">8. Data Handling</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Guest files are automatically deleted after 72 hours</li>
                <li>Subscriber files are retained for 180 days</li>
                <li>We use OCR technology to extract form fields from uploaded documents</li>
                <li>Processed data is stored securely with encryption</li>
                <li>See our Privacy Policy for complete data handling details</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">9. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee that:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The service will be uninterrupted or error-free</li>
                <li>OCR extraction will be 100% accurate</li>
                <li>Generated documents will be accepted by all recipients</li>
                <li>The service will meet all your specific requirements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">10. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, AutoFillPDF shall not be liable for any indirect, 
                incidental, special, consequential, or punitive damages, including but not limited to loss 
                of profits, data, or goodwill, arising from your use of the Service.
              </p>
              <p className="mt-4">
                Our total liability for any claims under these Terms shall not exceed the amount you paid 
                to us in the 12 months preceding the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">11. Indemnification</h2>
              <p>
                You agree to indemnify and hold harmless AutoFillPDF from any claims, damages, or expenses 
                arising from your use of the Service, violation of these Terms, or infringement of any 
                third-party rights.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">12. Termination</h2>
              <p>
                We may suspend or terminate your account at any time for violation of these Terms. Upon 
                termination, your right to use the Service immediately ceases, and we may delete your data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">13. Changes to Terms</h2>
              <p>
                We reserve the right to modify these Terms at any time. Material changes will be notified 
                via email or website notice. Continued use after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">14. Governing Law</h2>
              <p>
                These Terms are governed by the laws of the State of California, USA, without regard to 
                conflict of law principles. Any disputes shall be resolved in the courts of California.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">15. Contact</h2>
              <p>
                For questions about these Terms:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Email:</strong> admin@autofilllpdf.com</li>
                <li><strong>Website:</strong> autofilllpdf.com</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
