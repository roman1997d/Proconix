/**
 * Subscription plan placeholder routes (GET).
 * Used by See Plans page CTAs. Replace with real logic when implementing checkout.
 */

const express = require('express');
const router = express.Router();

const PLANS = {
  small_team: { name: 'Small Team', price: 49, message: 'Small Team plan. Full platform, 1–5 users.' },
  growing_team: { name: 'Growing Team', price: 180, message: 'Growing Team plan. 6–30 users, dedicated support.' },
  medium_team: { name: 'Medium Team', price: 299, message: 'Medium Team plan. 31–60 users, daily email digest.' },
  enterprise: { name: 'Enterprise', price: null, message: 'Enterprise — custom pricing. Contact sales.' },
  free: { name: 'Free Plan', price: 0, message: 'Free plan selected. Redirect to registration when ready.' },
  silver: { name: 'Silver Plan', price: 10, message: 'Silver plan selected. Checkout can be implemented here.' },
  gold: { name: 'Gold Plan', price: 20, message: 'Gold plan selected. Checkout can be implemented here.' },
  platinum: { name: 'Platinum Plan', price: 40, message: 'Platinum plan selected. Checkout can be implemented here.' },
};

['small_team', 'growing_team', 'medium_team', 'enterprise', 'free', 'silver', 'gold', 'platinum'].forEach(function (key) {
  router.get('/' + key, function (req, res) {
    const plan = PLANS[key];
    return res.status(200).json({
      success: true,
      plan: key,
      name: plan.name,
      price: plan.price,
      message: plan.message,
    });
  });
});

module.exports = router;
