import { storage } from './storage';
import { getUncachableStripeClient } from './stripeClient';

export type SubscriptionTier = 'starter' | 'pro' | 'enterprise';

export class StripeService {
  private createIdempotencyKey(prefix: string, parts: Array<string | null | undefined>) {
    const suffix = parts.filter(Boolean).join('_').slice(0, 80);
    return `${prefix}_${suffix}_${new Date().toISOString().slice(0, 10)}`;
  }

  async createCustomer(email: string, userId: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create(
      {
        email,
        metadata: { userId },
      },
      { idempotencyKey: this.createIdempotencyKey('pdfezfill_customer', [userId, email]) },
    );
  }

  async createOneTimeCheckoutSession(
    email: string | null,
    formId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const prices = await this.getGuestFormPrice();
    if (!prices || prices.length === 0) {
      throw new Error('Guest form price not configured in Stripe');
    }

    return await stripe.checkout.sessions.create(
      {
        customer_email: email || undefined,
        payment_method_types: ['card'],
        line_items: [{ price: prices[0].id, quantity: 1 }],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          formId,
          type: 'guest_form',
        },
      },
      { idempotencyKey: this.createIdempotencyKey('pdfezfill_guest_checkout', [formId, email]) },
    );
  }

  async createTrialCheckoutSession(
    email: string | null,
    formId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const prices = await this.getTrialFormPrice();
    if (!prices || prices.length === 0) {
      throw new Error('Trial form price not configured in Stripe');
    }

    return await stripe.checkout.sessions.create(
      {
        customer_email: email || undefined,
        payment_method_types: ['card'],
        line_items: [{ price: prices[0].id, quantity: 1 }],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          formId,
          type: 'trial_form',
        },
      },
      { idempotencyKey: this.createIdempotencyKey('pdfezfill_trial_checkout', [formId, email]) },
    );
  }

  async createSubscriptionCheckoutSession(
    customerId: string,
    tier: SubscriptionTier,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const prices = await this.getSubscriptionPrice(tier);
    if (!prices || prices.length === 0) {
      throw new Error(`${tier} subscription price not configured in Stripe`);
    }

    return await stripe.checkout.sessions.create(
      {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: prices[0].id, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          tier,
          type: `${tier}_subscription`,
        },
      },
      { idempotencyKey: this.createIdempotencyKey('pdfezfill_sub_checkout', [customerId, tier]) },
    );
  }

  async createExtraFormCheckoutSession(
    customerId: string,
    formId: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    const prices = await this.getExtraFormPrice();
    if (!prices || prices.length === 0) {
      throw new Error('Extra form price not configured in Stripe');
    }

    return await stripe.checkout.sessions.create(
      {
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: prices[0].id, quantity: 1 }],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          formId,
          type: 'extra_form',
        },
      },
      { idempotencyKey: this.createIdempotencyKey('pdfezfill_extra_checkout', [customerId, formId]) },
    );
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async createRefund(paymentIntentId: string, reason: string = 'PDF generation failed') {
    const stripe = await getUncachableStripeClient();
    return await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
      metadata: { reason },
    });
  }

  private async getGuestFormPrice() {
    return await storage.getPricesForProduct('guest_form');
  }

  private async getTrialFormPrice() {
    return await storage.getPricesForProduct('trial_form');
  }

  private async getSubscriptionPrice(tier: SubscriptionTier) {
    return await storage.getPricesForProduct(`${tier}_subscription`);
  }

  private async getExtraFormPrice(tier?: SubscriptionTier) {
    const prices = await storage.getPricesForProduct('extra_form');
    if (!prices || prices.length === 0) return [];
    
    // For enterprise tier, find the $1.50 price
    if (tier === 'enterprise') {
      const enterprisePrice = prices.find((p: any) => 
        p.unit_amount === 150 || 
        p.metadata?.tiers?.includes('enterprise')
      );
      return enterprisePrice ? [enterprisePrice] : prices;
    }
    
    // For starter/pro, find the $2 price
    const standardPrice = prices.find((p: any) => 
      p.unit_amount === 200 ||
      p.metadata?.tiers?.includes('starter') ||
      p.metadata?.tiers?.includes('pro')
    );
    return standardPrice ? [standardPrice] : prices;
  }

  private async getRegenerationPrice() {
    return await storage.getPricesForProduct('regeneration');
  }

  async getProduct(productId: string) {
    return await storage.getProduct(productId);
  }

  async getSubscription(subscriptionId: string) {
    return await storage.getSubscription(subscriptionId);
  }

  // Get all available subscription prices for display
  async getSubscriptionPrices() {
    const [starter, pro, enterprise] = await Promise.all([
      this.getSubscriptionPrice('starter'),
      this.getSubscriptionPrice('pro'),
      this.getSubscriptionPrice('enterprise'),
    ]);
    
    return {
      starter: starter[0] || null,
      pro: pro[0] || null,
      enterprise: enterprise[0] || null,
    };
  }

  // Create a 100% off coupon for testing
  async createFreeCoupon(name: string = 'Free PDF Conversion - Tester') {
    const stripe = await getUncachableStripeClient();
    
    return await stripe.coupons.create({
      percent_off: 100,
      duration: 'once',
      name,
      metadata: {
        purpose: 'tester_discount',
        created_by: 'admin',
      },
    });
  }

  // Create promotion codes that can be shared with testers
  async createPromotionCodes(
    couponId: string,
    codes: string[],
    maxRedemptionsPerCode: number = 1
  ) {
    const stripe = await getUncachableStripeClient();
    
    const createdCodes = [];
    for (const code of codes) {
      try {
        const promoCode = await stripe.promotionCodes.create({
          coupon: couponId,
          code: code.toUpperCase(),
          max_redemptions: maxRedemptionsPerCode,
          metadata: {
            purpose: 'tester_code',
          },
        });
        createdCodes.push({
          code: promoCode.code,
          id: promoCode.id,
          active: promoCode.active,
        });
      } catch (error: any) {
        console.error(`Failed to create promo code ${code}:`, error.message);
        createdCodes.push({
          code,
          error: error.message,
        });
      }
    }
    
    return createdCodes;
  }

  // List all active promotion codes
  async listPromotionCodes(limit: number = 100) {
    const stripe = await getUncachableStripeClient();
    
    const promoCodes = await stripe.promotionCodes.list({
      active: true,
      limit,
    });
    
    return promoCodes.data.map((pc) => ({
      id: pc.id,
      code: pc.code,
      couponId: pc.coupon,
      active: pc.active,
      timesRedeemed: pc.times_redeemed,
      maxRedemptions: pc.max_redemptions,
      expiresAt: pc.expires_at,
    }));
  }

  // Deactivate a promotion code
  async deactivatePromotionCode(promoCodeId: string) {
    const stripe = await getUncachableStripeClient();
    
    return await stripe.promotionCodes.update(promoCodeId, {
      active: false,
    });
  }
}

export const stripeService = new StripeService();
