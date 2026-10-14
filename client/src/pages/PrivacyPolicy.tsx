import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: December 1, 2025</p>
          
          <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
              <p>
                AutoFillPDF ("we", "our", or "us") operates the autofilllpdf.com website and related services. 
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when 
                you use our PDF form-filling service.
              </p>
              <p>
                We are committed to protecting your privacy and complying with the General Data Protection 
                Regulation (GDPR) and the California Consumer Privacy Act (CCPA).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">2. Information We Collect</h2>
              
              <h3 className="text-xl font-medium mt-6 mb-3">Personal Information</h3>
              <p>We may collect the following personal information:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Name, email address when you create an account via Replit Auth</li>
                <li><strong>Profile Data:</strong> Name, address, phone, date of birth, and other form-filling data you choose to save</li>
                <li><strong>Payment Information:</strong> Processed securely through Stripe; we do not store credit card numbers</li>
                <li><strong>Uploaded Documents:</strong> PDF forms you upload for processing</li>
                <li><strong>Signature Data:</strong> Digital signatures you create within the service</li>
              </ul>

              <h3 className="text-xl font-medium mt-6 mb-3">Automatically Collected Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Device Information:</strong> Browser type, operating system, IP address</li>
                <li><strong>Usage Data:</strong> Pages visited, features used, time spent on service</li>
                <li><strong>Cookies:</strong> Session cookies for authentication and analytics</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">3. How We Use Your Information</h2>
              <p>We use your information to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide and maintain our PDF form-filling service</li>
                <li>Process your forms and generate completed documents</li>
                <li>Enable autofill functionality from saved profiles</li>
                <li>Process payments and manage subscriptions</li>
                <li>Send transactional emails (form ready, payment confirmations)</li>
                <li>Send marketing emails (only with your consent)</li>
                <li>Improve our service and develop new features</li>
                <li>Detect and prevent fraud or abuse</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Retention</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Guest Users:</strong> Uploaded files and completed PDFs are automatically deleted after <strong>72 hours</strong></li>
                <li><strong>Pro/Paid Users:</strong> Form data retained for <strong>180 days</strong> for re-download and regeneration</li>
                <li><strong>Account Data:</strong> Retained while your account is active; deleted upon account deletion request</li>
                <li><strong>Payment Records:</strong> Retained for 7 years for tax and legal compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">5. Data Sharing and Third Parties</h2>
              <p>We share your information with:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Stripe:</strong> Payment processing (PCI-DSS compliant)</li>
                <li><strong>MailerSend:</strong> Transactional and marketing emails</li>
                <li><strong>Replit:</strong> Hosting and authentication services</li>
                <li><strong>Analytics providers:</strong> To understand service usage</li>
              </ul>
              <p className="mt-4 font-semibold">
                We do NOT sell your personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">6. Your Rights (GDPR & CCPA)</h2>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Rectification:</strong> Correct inaccurate or incomplete data</li>
                <li><strong>Erasure:</strong> Request deletion of your data ("right to be forgotten")</li>
                <li><strong>Portability:</strong> Receive your data in a portable format</li>
                <li><strong>Restrict Processing:</strong> Limit how we use your data</li>
                <li><strong>Object:</strong> Object to processing for marketing purposes</li>
                <li><strong>Opt-Out of Sale:</strong> (CCPA) We do not sell data, but you can submit a request</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, contact us at <strong>admin@autofilllpdf.com</strong> or 
                use the settings in your account dashboard.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">7. Security Measures</h2>
              <p>We protect your data with:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>256-bit SSL/TLS encryption for all data transfers</li>
                <li>Encrypted storage for sensitive information</li>
                <li>Automatic file deletion after retention period</li>
                <li>Regular security audits and updates</li>
                <li>Access controls and authentication requirements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">8. Cookies</h2>
              <p>We use cookies for:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
                <li><strong>Analytics Cookies:</strong> To understand how you use our service (can be disabled)</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings. Disabling essential cookies may 
                affect service functionality.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">9. Children's Privacy</h2>
              <p>
                Our service is not intended for children under 16. We do not knowingly collect 
                personal information from children. If you believe we have collected data from 
                a child, please contact us immediately.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">10. International Data Transfers</h2>
              <p>
                Your data may be processed in the United States. We ensure appropriate safeguards 
                are in place, including Standard Contractual Clauses, to protect your data in 
                compliance with GDPR.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">11. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy periodically. We will notify you of material 
                changes via email or a prominent notice on our website. The "Last updated" date 
                at the top indicates the most recent revision.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">12. Contact Us</h2>
              <p>
                For privacy-related questions or to exercise your rights:
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
