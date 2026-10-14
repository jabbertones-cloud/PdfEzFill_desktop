import { getStripeSync } from './stripeClient';
import { storage } from './storage';
import { renderCompletedPdf } from './pdfRenderer';
import { triggerEmailByEvent, sendEmailDirect } from './emailAutomation';
import Stripe from 'stripe';

// Unified APP_URL for email links
const APP_URL = process.env.APP_URL 
  || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null)
  || "https://autofilllpdf.com";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      const errorMsg = 'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        `Received type: ${typeof payload}. ` +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!payload.length) {
      throw new Error('STRIPE WEBHOOK ERROR: Received empty payload');
    }

    const sync = await getStripeSync();
    
    // Process with StripeSync - this verifies and handles the event
    await sync.processWebhook(payload, signature, uuid);
    
    // Also handle our custom logic by parsing the payload directly
    // StripeSync has already verified the signature, so we can trust the payload
    const eventData = JSON.parse(payload.toString());
    await WebhookHandlers.handleEvent(eventData as Stripe.Event);
  }

  static async handleEvent(event: Stripe.Event): Promise<void> {
    console.log(`[webhook] Processing event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      
      case 'invoice.paid':
        await WebhookHandlers.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
      
      case 'invoice.payment_failed':
        await WebhookHandlers.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
    }
  }

  static async handleCheckoutComplete(session: Stripe.Checkout.Session): Promise<void> {
    console.log(`[webhook] Checkout session completed: ${session.id}`);

    // Find payment by session ID
    const payment = await storage.getPaymentBySessionId(session.id);
    if (!payment) {
      console.log(`[webhook] No payment found for session ${session.id}`);
      return;
    }

    // Update payment status
    await storage.updatePayment(payment.id, {
      status: 'completed',
      stripePaymentIntentId: session.payment_intent as string,
    });

    // Get the form
    const form = payment.formId ? await storage.getForm(payment.formId) : null;

    if (form) {
      // IMPORTANT: Save guest email to the form for automation to work
      const guestEmail = session.customer_email;
      if (guestEmail && !form.userId) {
        await storage.updateForm(form.id, {
          guestEmail: guestEmail,
        });
        console.log(`[webhook] Saved guest email ${guestEmail} to form ${form.id}`);
      }

      // Mark form as paid
      await storage.updateForm(form.id, {
        isPaid: true,
        paymentType: payment.type,
      });

      // Generate PDF
      if (form.originalPdfPath) {
        console.log(`[webhook] Generating PDF for form ${form.id}`);
        
        const renderResult = await renderCompletedPdf({
          answers: form.answers || {},
          signatureData: form.signatureData,
          fields: form.fieldSchema || [],
          fieldOverrides: form.fieldOverrides || [],
          originalPdfPath: form.originalPdfPath,
          formId: form.id,
          fileName: form.fileName,
        });

        if (renderResult.success) {
          await storage.updateForm(form.id, {
            status: 'completed',
            completedAt: new Date(),
            generatedPdfPath: renderResult.generatedPath,
          });

          // Send email notification via automation system
          const user = form.userId ? await storage.getUser(form.userId) : null;
          const email = user?.email || guestEmail;
          
          if (email) {
            await triggerEmailByEvent("form_completed", email, {
              user_name: user?.firstName || "User",
              form_name: form.fileName || form.originalFileName || "Your form",
              form_id: form.id,
              download_url: `${APP_URL}/download/${form.id}`,
            });
            console.log(`[webhook] Triggered form_completed email to ${email}`);
          }
        } else {
          console.error(`[webhook] PDF generation failed for form ${form.id}:`, renderResult.error);
          await storage.updateForm(form.id, { status: 'error' });
        }
      }
    }

    // Handle subscription checkout
    if (session.mode === 'subscription' && session.customer) {
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
      
      // Find user by Stripe customer ID
      const user = await storage.getUserByStripeCustomerId(customerId);
      if (user && user.email) {
        const planName = user.planType === 'pro_plus' ? 'Pro+' : 
                        user.planType === 'team' ? 'Enterprise' : 'Starter';
        
        await triggerEmailByEvent("subscription_start", user.email, {
          user_name: user.firstName || "User",
          plan_name: planName,
        });
        console.log(`[webhook] Triggered subscription_start email to ${user.email}`);
      }
    }

    // Send payment receipt via automation system
    if (session.customer_email && session.amount_total) {
      let productName = 'Form Processing';
      if (session.mode === 'subscription') {
        const tier = session.metadata?.tier;
        if (tier === 'enterprise') productName = 'Enterprise Subscription';
        else if (tier === 'pro') productName = 'Pro+ Subscription';
        else productName = 'Starter Subscription';
      } else if (payment.type === 'regeneration') {
        productName = 'Form Regeneration';
      } else if (payment.type === 'overage') {
        productName = 'Extra Form';
      } else if (payment.type === 'trial') {
        productName = 'First Document Trial';
      } else if (payment.type === 'guest') {
        productName = 'Guest Form Fill';
      }
      
      await triggerEmailByEvent("payment_success", session.customer_email, {
        user_name: "User",
        amount: `$${(session.amount_total / 100).toFixed(2)}`,
        product_name: productName,
      });
      console.log(`[webhook] Triggered payment_success email to ${session.customer_email}`);
    }
  }

  static async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    console.log(`[webhook] Invoice paid: ${invoice.id}`);
    
    if (!invoice.customer) return;
    
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (user) {
      // Reset usage period on subscription renewal
      const planConfig = {
        pro: { formsIncluded: 2, name: 'Starter' },
        pro_plus: { formsIncluded: 10, name: 'Pro+' },
        team: { formsIncluded: 50, name: 'Enterprise' },
      };
      
      const config = planConfig[user.planType as keyof typeof planConfig];
      if (config) {
        await storage.createOrResetUsagePeriod(user.id, config.formsIncluded);
        console.log(`[webhook] Reset usage period for user ${user.id}`);
        
        // Send renewal receipt email
        const email = user.email || invoice.customer_email;
        if (email && invoice.amount_paid) {
          await triggerEmailByEvent("payment_success", email, {
            user_name: user.firstName || "User",
            amount: `$${(invoice.amount_paid / 100).toFixed(2)}`,
            product_name: `${config.name} Subscription Renewal`,
          });
          console.log(`[webhook] Triggered renewal receipt email to ${email}`);
        }
      }
    }
  }

  static async handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
    console.log(`[webhook] Subscription changed: ${subscription.id}`);
    
    if (!subscription.customer) return;
    
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (user) {
      // Determine plan type from subscription items
      let planType: 'pro' | 'pro_plus' | 'team' = 'pro';
      
      const priceId = subscription.items.data[0]?.price?.id;
      if (priceId) {
        // Check price metadata or amount to determine plan
        const amount = subscription.items.data[0]?.price?.unit_amount;
        if (amount === 4900) planType = 'team';
        else if (amount === 1500) planType = 'pro_plus';
      }

      await storage.updateUser(user.id, {
        planType,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      });

      // Initialize usage period
      const planConfig = {
        pro: { formsIncluded: 2 },
        pro_plus: { formsIncluded: 10 },
        team: { formsIncluded: 50 },
      };
      
      await storage.createOrResetUsagePeriod(user.id, planConfig[planType].formsIncluded);
    }
  }

  static async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    console.log(`[webhook] Subscription canceled: ${subscription.id}`);
    
    if (!subscription.customer) return;
    
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (user) {
      await storage.updateUser(user.id, {
        planType: 'none',
        subscriptionStatus: 'canceled',
      });
      
      // Trigger subscription cancel email
      if (user.email) {
        await triggerEmailByEvent("subscription_cancel", user.email, {
          user_name: user.firstName || "User",
        });
        console.log(`[webhook] Triggered subscription_cancel email to ${user.email}`);
      }
    }
  }

  static async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    console.log(`[webhook] Payment failed for invoice: ${invoice.id}`);
    
    if (!invoice.customer) return;
    
    const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer.id;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user?.email) {
      console.log(`[webhook] No user found for customer ${customerId}`);
      return;
    }

    // Determine plan name (pro tier = Starter, team tier = Enterprise)
    const planName = user.planType === 'pro_plus' ? 'Pro+' : 
                    user.planType === 'team' ? 'Enterprise' : 'Starter';
    
    // Get amount
    const amount = invoice.amount_due || 0;
    
    // Calculate next retry date (Stripe retries 3 times over ~2 weeks)
    const attemptCount = invoice.attempt_count || 0;
    let nextRetryDate: Date | undefined;
    if (attemptCount < 3) {
      // Stripe typically retries in 3, 5, 7 days
      const daysUntilRetry = attemptCount === 0 ? 3 : attemptCount === 1 ? 5 : 7;
      nextRetryDate = new Date(Date.now() + daysUntilRetry * 24 * 60 * 60 * 1000);
    }
    
    // Send payment failed email via automation system
    await sendEmailDirect({
      to: user.email,
      toName: user.firstName || "User",
      subject: `Payment failed for your AutoFillPDF ${planName} subscription`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #ef4444;">Payment Failed</h1>
          <p>Hi ${user.firstName || "there"},</p>
          <p>We weren't able to process your payment of <strong>$${(amount / 100).toFixed(2)}</strong> for your AutoFillPDF ${planName} subscription.</p>
          <p>${nextRetryDate ? `We'll automatically try again on ${nextRetryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : 'Please update your payment method to continue your subscription.'}</p>
          <p>To avoid any interruption to your service, please update your payment information:</p>
          <p style="margin: 24px 0;">
            <a href="${APP_URL}/dashboard?tab=billing&utm_source=email&utm_medium=automation&utm_campaign=payment_failed" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Update Payment Method
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">
            Questions? Contact us at admin@autofilllpdf.com
          </p>
        </div>
      `,
      text: `Payment of $${(amount / 100).toFixed(2)} failed for AutoFillPDF ${planName}. Update your payment method: ${APP_URL}/dashboard?tab=billing`,
      userId: user.id,
    });
    
    console.log(`[webhook] Sent payment failed email to ${user.email}`);
    
    // Update user's subscription status
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due',
    });
    
    // If this is a later retry attempt, also send a past due reminder
    if (attemptCount > 0) {
      const daysPastDue = attemptCount * 3; // Rough estimate
      
      await sendEmailDirect({
        to: user.email,
        toName: user.firstName || "User",
        subject: `Action required: Your AutoFillPDF subscription is past due`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: ${daysPastDue > 7 ? '#ef4444' : '#f59e0b'};">Subscription Past Due</h1>
            <p>Hi ${user.firstName || "there"},</p>
            <p>Your AutoFillPDF ${planName} subscription is <strong>${daysPastDue} days past due</strong>.</p>
            <p style="color: ${daysPastDue > 7 ? '#ef4444' : '#f59e0b'}; font-weight: bold;">
              ${daysPastDue > 7 ? 'Your subscription will be cancelled soon if payment is not received.' : 'Please update your payment method to keep your subscription active.'}
            </p>
            <p style="margin: 24px 0;">
              <a href="${APP_URL}/dashboard?tab=billing&utm_source=email&utm_medium=automation&utm_campaign=subscription_past_due" 
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Update Payment Method
              </a>
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
            <p style="color: #999; font-size: 12px;">
              Need help? Contact us at admin@autofilllpdf.com
            </p>
          </div>
        `,
        text: `Your AutoFillPDF ${planName} subscription is ${daysPastDue} days past due. Update your payment: ${APP_URL}/dashboard?tab=billing`,
        userId: user.id,
      });
    }
  }
}
