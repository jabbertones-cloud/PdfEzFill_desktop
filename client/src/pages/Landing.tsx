import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  Upload,
  Download,
  Shield,
  Clock,
  Sparkles,
  PenTool,
  RefreshCw,
  ArrowRight,
  Check,
  Lock,
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/10 pointer-events-none" />
          <div className="container mx-auto px-4 py-12 md:py-20 lg:py-24">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              {/* Honest Launch Status */}
              <Badge variant="secondary" className="px-4 py-1.5" data-testid="badge-launch-status">
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Free Desktop App
              </Badge>
              
              {/* Headline - Clear value proposition */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight" data-testid="text-hero-headline">
                Fill Out Any PDF Form — Fast and Easy
              </h1>
              
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-subheadline">
                Upload your PDF. Type your answers. Download the finished form. That is it!
              </p>
              
              {/* Single Focused CTA */}
              <div className="flex flex-col items-center justify-center gap-4 pt-4">
                <Button size="lg" className="h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg shadow-lg" asChild data-testid="button-upload-hero">
                  <Link href="/upload">
                    <Upload className="mr-2 h-5 w-5" />
                    Open a PDF to Fill
                  </Link>
                </Button>
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  Free to use • No internet needed
                </span>
              </div>
              
              {/* Trust Badges */}
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-6 sm:pt-8 border-t border-border/50 mt-6 sm:mt-8">
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <div className="p-1 sm:p-1.5 rounded-full bg-green-100 dark:bg-green-900/30">
                    <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="font-medium">256-bit Encryption</span>
                </div>
                <div className="flex items-center gap-2 text-xs sm:text-sm">
                  <div className="p-1 sm:p-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-medium">Auto-Delete After Use</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-4 mb-12 md:mb-16">
              <Badge variant="secondary" className="px-3 py-1">3 Easy Steps</Badge>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Here Is How It Works</h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
                No printing. No scanning. Just type and download.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-6 md:gap-8 max-w-5xl mx-auto">
              {[
                {
                  step: "1",
                  icon: Upload,
                  title: "Upload any PDF",
                  description: "Pick your PDF from your computer. We read it and find all the boxes for you.",
                },
                {
                  step: "2",
                  icon: PenTool,
                  title: "Fill the clean form",
                  description: "Type your answers in the boxes. You can also draw your signature right here.",
                },
                {
                  step: "3",
                  icon: Download,
                  title: "Download & submit",
                  description: "Your finished PDF is ready. Save it to your computer and use it anywhere.",
                },
              ].map((item, index) => (
                <div key={index} className="relative">
                  <Card className="h-full border-2 hover-elevate transition-all duration-200">
                    <CardHeader className="text-center pb-4">
                      <div className="mx-auto mb-4 relative">
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                          <item.icon className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
                        </div>
                        <span className="absolute -top-2 -right-2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary text-primary-foreground text-xs sm:text-sm font-bold flex items-center justify-center">
                          {item.step}
                        </span>
                      </div>
                      <CardTitle className="text-lg sm:text-xl">{item.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center">
                      <CardDescription className="text-sm sm:text-base leading-relaxed">
                        {item.description}
                      </CardDescription>
                    </CardContent>
                  </Card>
                  {index < 2 && (
                    <div className="hidden md:block absolute top-1/4 -right-4 w-8 text-muted-foreground/30">
                      <ArrowRight className="w-8 h-8" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-4 mb-12 md:mb-16">
              <Badge variant="secondary" className="px-3 py-1">What You Can Do</Badge>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Easy Ways to Fill Forms</h2>
              <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto">
                Everything you need, all in one place.
              </p>
            </div>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-5xl mx-auto">
              {[
                {
                  icon: RefreshCw,
                  title: "One-click autofill",
                  description: "Save your info once. Fill any form in seconds with one click.",
                },
                {
                  icon: PenTool,
                  title: "Built-in signature",
                  description: "Sign your name right on screen. No printer needed.",
                },
                {
                  icon: Shield,
                  title: "Privacy-first design",
                  description: "Your files stay on your computer. Nothing is sent online.",
                },
                {
                  icon: Clock,
                  title: "180-day history",
                  description: "See all your old forms. Download them again any time.",
                },
              ].map((feature, index) => (
                <Card key={index} className="border hover-elevate transition-all duration-200">
                  <CardHeader className="pb-2 sm:pb-4">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-2 sm:mb-3">
                      <feature.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <CardTitle className="text-base sm:text-lg">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm sm:text-base leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>



        {/* FAQ Section */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center space-y-4 mb-10 md:mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Frequently Asked Questions</h2>
            </div>
            
            <div className="max-w-3xl mx-auto space-y-4">
              {[
                {
                  q: "Does it work with scanned PDFs?",
                  a: "Yes! We can read scanned PDFs and image-based documents. Just upload any PDF and we will find all the boxes for you to fill in."
                },
                {
                  q: "Is my data secure?",
                  a: "Yes. We use strong encryption and your files stay on your computer. Nothing is sent online unless you choose to email or print your finished form."
                },
                {
                  q: "Do I need to create an account?",
                  a: "No. PdfEzFill is a desktop app. Just open it and start filling out your forms right away."
                },
                {
                  q: "Can I use it offline?",
                  a: "Yes! This app works without internet. All your work happens on your computer."
                },
                {
                  q: "Can I save my forms?",
                  a: "Yes. You can download your finished PDF and save it anywhere on your computer. You can also open old forms again and fill them with new information."
                },
              ].map((faq, index) => (
                <Card key={index} className="border">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base font-medium">{faq.q}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm sm:text-base text-muted-foreground">{faq.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA Section */}
        <section className="py-16 md:py-24 bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 text-center space-y-6 sm:space-y-8">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">
              Ready to Start?
            </h2>
            <p className="text-base sm:text-lg opacity-90 max-w-2xl mx-auto">
              Pick your first PDF and fill it out in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" variant="secondary" className="h-12 sm:h-14 px-8 sm:px-10 text-base sm:text-lg w-full sm:w-auto" asChild data-testid="button-upload-cta">
                <Link href="/upload">
                  <Upload className="mr-2 h-5 w-5" />
                  Open Your First PDF
                </Link>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs sm:text-sm opacity-80">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Free to use
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Works offline
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                Your files stay private
              </span>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
