/**
 * Default billing window when a company self-registers (no real payment gateway yet).
 * Aligns with see_plans.html / price_policy.md tiers + legacy plans.
 */

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function addMonths(d, n) {
  const x = new Date(d.getTime());
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

/**
 * @param {string} subscriptionPlan - value stored in companies.subscription_plan
 * @returns {{ plan_purchased_at: Date, plan_expires_at: Date, payment_method: string }}
 */
function getPlanBillingDefaults(subscriptionPlan) {
  const now = new Date();
  const s = String(subscriptionPlan || '').toLowerCase().trim();

  let expires;
  if (s.includes('small team')) {
    expires = addDays(now, 30);
  } else if (s.includes('growing team') || s.includes('medium team') || s.includes('enterprise')) {
    expires = addMonths(now, 1);
  } else if (s === 'free' || s.includes('free')) {
    expires = addDays(now, 30);
  } else if (s.includes('silver')) {
    expires = addMonths(now, 3);
  } else if (s.includes('gold')) {
    expires = addMonths(now, 6);
  } else if (s.includes('platinum')) {
    expires = addMonths(now, 12);
  } else if (s.includes('1 month')) {
    expires = addMonths(now, 1);
  } else if (s.includes('3 month')) {
    expires = addMonths(now, 3);
  } else if (s.includes('6 month')) {
    expires = addMonths(now, 6);
  } else if (s.includes('12 month')) {
    expires = addMonths(now, 12);
  } else {
    expires = addMonths(now, 1);
  }

  return {
    plan_purchased_at: now,
    plan_expires_at: expires,
    payment_method: 'registration',
    billing_status: 'unpaid_active',
  };
}

module.exports = { getPlanBillingDefaults };
