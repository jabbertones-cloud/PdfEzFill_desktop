import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Creating AutoFillPDF products in Stripe...');

  const existingProducts = await stripe.products.list({ limit: 100 });
  const existingNames = existingProducts.data.map(p => p.name);

  // Guest Form - $5 one-time
  if (!existingNames.includes('Guest Form Fill')) {
    const guestProduct = await stripe.products.create({
      name: 'Guest Form Fill',
      description: 'Fill and download a single PDF form without account',
      metadata: {
        type: 'guest_form',
        category: 'one-time',
      },
    });

    await stripe.prices.create({
      product: guestProduct.id,
      unit_amount: 500, // $5.00
      currency: 'usd',
      metadata: {
        type: 'guest_form',
      },
    });

    console.log('Created Guest Form Fill product: $5');
  } else {
    console.log('Guest Form Fill product already exists');
  }

  // First Document Trial - $1 one-time
  if (!existingNames.includes('First Document Trial')) {
    const trialProduct = await stripe.products.create({
      name: 'First Document Trial',
      description: 'Try AutoFillPDF for just $1 on your first document',
      metadata: {
        type: 'trial_form',
        category: 'one-time',
      },
    });

    await stripe.prices.create({
      product: trialProduct.id,
      unit_amount: 100, // $1.00
      currency: 'usd',
      metadata: {
        type: 'trial_form',
      },
    });

    console.log('Created First Document Trial product: $1');
  } else {
    console.log('First Document Trial product already exists');
  }

  // Starter Plan - $7/month (formerly Pro)
  if (!existingNames.includes('Starter Plan')) {
    const starterProduct = await stripe.products.create({
      name: 'Starter Plan',
      description: 'AutoFillPDF Starter - 2 forms/month, autofill, saved signature, 180-day history (Founding Member Rate)',
      metadata: {
        type: 'starter_subscription',
        category: 'subscription',
        formsIncluded: '2',
        tier: 'pro',
      },
    });

    await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 700, // $7.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        type: 'starter_subscription',
      },
    });

    console.log('Created Starter Plan product: $7/month');
  } else {
    console.log('Starter Plan product already exists');
  }

  // Pro+ Plan - $15/month
  if (!existingNames.includes('Pro+ Plan')) {
    const proPlusProduct = await stripe.products.create({
      name: 'Pro+ Plan',
      description: 'AutoFillPDF Pro+ - 10 forms/month, priority processing, multi-profile (Founding Member Rate through Jan 2026)',
      metadata: {
        type: 'pro_subscription',
        category: 'subscription',
        formsIncluded: '10',
        tier: 'pro_plus',
      },
    });

    await stripe.prices.create({
      product: proPlusProduct.id,
      unit_amount: 1500, // $15.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        type: 'pro_subscription',
      },
    });

    console.log('Created Pro+ Plan product: $15/month');
  } else {
    console.log('Pro+ Plan product already exists');
  }

  // Enterprise Plan - $49/month
  if (!existingNames.includes('Enterprise Plan')) {
    const enterpriseProduct = await stripe.products.create({
      name: 'Enterprise Plan',
      description: 'AutoFillPDF Enterprise - 50 forms/month, unlimited team members, bulk processing (Founding Member Rate through Jan 2026)',
      metadata: {
        type: 'enterprise_subscription',
        category: 'subscription',
        formsIncluded: '50',
        teamMembers: 'unlimited',
        tier: 'team',
      },
    });

    await stripe.prices.create({
      product: enterpriseProduct.id,
      unit_amount: 4900, // $49.00
      currency: 'usd',
      recurring: { interval: 'month' },
      metadata: {
        type: 'enterprise_subscription',
      },
    });

    console.log('Created Enterprise Plan product: $49/month');
  } else {
    console.log('Enterprise Plan product already exists');
  }

  // Extra Form - $2 for Starter/Pro+ users (overage)
  if (!existingNames.includes('Extra Form')) {
    const extraProduct = await stripe.products.create({
      name: 'Extra Form',
      description: 'Additional form processing for subscribers who exceed their monthly limit',
      metadata: {
        type: 'extra_form',
        category: 'overage',
      },
    });

    await stripe.prices.create({
      product: extraProduct.id,
      unit_amount: 200, // $2.00 for Starter/Pro+
      currency: 'usd',
      metadata: {
        type: 'extra_form',
        tiers: 'starter,pro_plus',
      },
    });

    await stripe.prices.create({
      product: extraProduct.id,
      unit_amount: 150, // $1.50 for Enterprise
      currency: 'usd',
      metadata: {
        type: 'extra_form',
        tiers: 'enterprise',
      },
    });

    console.log('Created Extra Form products: $2 (Starter/Pro+), $1.50 (Enterprise)');
  } else {
    console.log('Extra Form product already exists');
  }

  // Form Regeneration - $2 for expired forms
  if (!existingNames.includes('Form Regeneration')) {
    const regenProduct = await stripe.products.create({
      name: 'Form Regeneration',
      description: 'Regenerate an expired form at a reduced price',
      metadata: {
        type: 'regeneration',
        category: 'one-time',
      },
    });

    await stripe.prices.create({
      product: regenProduct.id,
      unit_amount: 200, // $2.00
      currency: 'usd',
      metadata: {
        type: 'regeneration',
      },
    });

    console.log('Created Form Regeneration product: $2');
  } else {
    console.log('Form Regeneration product already exists');
  }

  console.log('\nProduct creation complete!');
  console.log('\nProduct type to metadata mapping:');
  console.log('  guest_form - $5 one-time guest payment');
  console.log('  trial_form - $1 first document trial');
  console.log('  starter_subscription - $7/mo Starter plan (db tier: pro)');
  console.log('  pro_subscription - $15/mo Pro+ plan (db tier: pro_plus)');
  console.log('  enterprise_subscription - $49/mo Enterprise plan (db tier: team)');
  console.log('  extra_form - $2/$1.50 overage forms');
  console.log('  regeneration - $2 form regeneration');
}

createProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error creating products:', error);
    process.exit(1);
  });
