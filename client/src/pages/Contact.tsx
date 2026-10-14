import { useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Mail, MessageSquare, Clock, CheckCircle2, Send, HelpCircle, AlertCircle, Sparkles } from "lucide-react";

export default function Contact() {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const contactMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return apiRequest("POST", "/api/contact", data);
    },
    onSuccess: () => {
      toast({
        title: "Message sent!",
        description: "We'll get back to you within 24 hours.",
      });
      setFormData({ name: "", email: "", subject: "", message: "" });
    },
    onError: () => {
      toast({
        title: "Error sending message",
        description: "Please try again or email us directly.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.message) {
      toast({
        title: "Missing information",
        description: "Please fill in your email and message.",
        variant: "destructive",
      });
      return;
    }
    contactMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12 md:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center mb-10 md:mb-12">
            <h1 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-contact-title">
              Contact & Support
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Have a question or need help? We're here to assist you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Mail className="h-5 w-5 text-primary" />
                    Email Us
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-3">
                    For support inquiries, billing questions, or general feedback:
                  </p>
                  <a 
                    href="mailto:support@autofilllpdf.com" 
                    className="text-primary font-medium hover:underline"
                    data-testid="link-support-email"
                  >
                    support@autofilllpdf.com
                  </a>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="h-5 w-5 text-primary" />
                    Response Time
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    We typically respond within <strong>24 hours</strong> during business days. 
                    For urgent issues, please mention "URGENT" in your subject line.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <HelpCircle className="h-5 w-5 text-primary" />
                    Common Questions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      <strong>Payment issues?</strong> Check your email for receipt, or contact us with your email address.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      <strong>Form not processing?</strong> Try uploading a clearer PDF scan.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">
                      <strong>Need a refund?</strong> We offer a 30-day satisfaction guarantee.
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  Send a Message
                </CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you soon.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Name (optional)</Label>
                    <Input
                      id="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      data-testid="input-contact-name"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      data-testid="input-contact-email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input
                      id="subject"
                      placeholder="What's this about?"
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      data-testid="input-contact-subject"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      placeholder="How can we help you?"
                      rows={5}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      data-testid="input-contact-message"
                    />
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={contactMutation.isPending}
                    data-testid="button-contact-submit"
                  >
                    {contactMutation.isPending ? (
                      <>
                        <Sparkles className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="mt-12 text-center p-6 bg-muted/50 rounded-xl border">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Need Immediate Help?</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              For urgent issues, email us directly at{" "}
              <a href="mailto:support@autofilllpdf.com" className="text-primary hover:underline font-medium">
                support@autofilllpdf.com
              </a>
              {" "}with "URGENT" in the subject line.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
