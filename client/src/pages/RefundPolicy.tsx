import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { BadgeCheck, Clock, Mail, Shield } from "lucide-react";

export default function RefundPolicy() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="text-4xl font-bold mb-2">Refund Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: December 1, 2025</p>
          
          {/* Highlight Box */}
          <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 mb-8">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                  <BadgeCheck className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">
                    30-Day Money-Back Guarantee
                  </h2>
                  <p className="text-green-800 dark:text-green-300">
                    We're confident you'll love AutoFillPDF. If you're not completely satisfied within 
                    30 days of your subscription purchase, we'll refund 100% of your payment. No questions asked.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Subscription Refunds</h2>
              
              <div className="grid md:grid-cols-2 gap-4 my-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold">Within 30 Days</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Full refund, no questions asked. Simply contact us and we'll process your 
                      refund within 5-7 business days.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3 mb-3">
                      <Clock className="w-5 h-5 text-muted-foreground" />
                      <h3 className="font-semibold">After 30 Days</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Refunds are at our discretion. We consider the reason for your request and 
                      may offer prorated refunds or account credits.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <h3 className="text-xl font-medium mt-6 mb-3">How to Request a Subscription Refund</h3>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Email us at <strong>admin@autofilllpdf.com</strong> with your account email</li>
                <li>Include "Refund Request" in the subject line</li>
                <li>Tell us briefly why you're requesting a refund (optional, helps us improve)</li>
                <li>We'll confirm receipt within 24 hours</li>
                <li>Refund processed within 5-7 business days to your original payment method</li>
              </ol>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Pay-Per-Form Purchases</h2>
              <p>
                One-time form purchases ($5/form) are eligible for refunds only if:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Technical Failure:</strong> The form could not be processed due to our system error</li>
                <li><strong>Duplicate Charge:</strong> You were accidentally charged twice</li>
                <li><strong>Before Download:</strong> You haven't downloaded the completed PDF yet</li>
              </ul>
              <p className="mt-4">
                <strong>Non-refundable:</strong> Once you've successfully downloaded a completed PDF, that 
                purchase cannot be refunded as the service has been fully rendered.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Extra Form Purchases</h2>
              <p>
                Additional forms purchased within a subscription (overage forms) follow the same rules 
                as pay-per-form purchases. Refunds are available before download or in case of technical issues.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">What's Not Covered</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Forms completed and downloaded successfully</li>
                <li>Refund requests made after 30 days (except at our discretion)</li>
                <li>Accounts terminated for Terms of Service violations</li>
                <li>Change of mind after using included monthly forms</li>
                <li>Upgrades/downgrades mid-billing cycle (prorated automatically)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Cancellation vs. Refund</h2>
              <p>
                <strong>Cancellation:</strong> Stops future billing. You keep access until the end of 
                your current billing period. Cancel anytime from your account settings.
              </p>
              <p className="mt-4">
                <strong>Refund:</strong> Returns money already paid. Typically ends your access immediately 
                unless otherwise arranged.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Processing Time</h2>
              <div className="bg-muted/50 rounded-lg p-4">
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>Refund request review: <strong>24 hours</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>Refund processing: <strong>5-7 business days</strong></span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" />
                    <span>Bank statement update: <strong>1-2 billing cycles</strong></span>
                  </li>
                </ul>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Contact Us</h2>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Mail className="w-5 h-5 text-primary" />
                    <span className="font-medium">admin@autofilllpdf.com</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Our support team is available Monday-Friday, 9am-5pm PST. We respond to all 
                    refund requests within 24 hours.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section>
              <h2 className="text-2xl font-semibold mt-8 mb-4">Our Commitment</h2>
              <p>
                We stand behind our service. If AutoFillPDF doesn't save you time and frustration, 
                we don't want your money. The 30-day guarantee gives you plenty of time to experience 
                the full value of our service risk-free.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
