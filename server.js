require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const { buildSnapshot, runDigest } = require('./src/services/digest');
const { startScheduler } = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use('/api/', limiter);

app.use('/api/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.post('/api/create-subscription', async (req, res) => {
  const { email, planId, paymentMethodId } = req.body;
  if (!email || !planId || !paymentMethodId) {
    return res.status(400).json({ error: '必須パラメータが不足しています' });
  }
  const priceMap = {
    standard: process.env.STRIPE_PRICE_STANDARD,
    team: process.env.STRIPE_PRICE_TEAM,
  };
  const priceId = priceMap[planId];
  if (!priceId) return res.status(400).json({ error: '無効なプランIDです' });

  try {
    let customer;
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      customer = existing.data[0];
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
    } else {
      customer = await stripe.customers.create({
        email,
        payment_method: paymentMethodId,
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    }
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });
    const paymentIntent = subscription.latest_invoice.payment_intent;
    if (paymentIntent.status === 'succeeded') {
      return res.json({ success: true, subscriptionId: subscription.id, plan: planId });
    } else if (paymentIntent.status === 'requires_action') {
      return res.json({ requiresAction: true, clientSecret: paymentIntent.client_secret });
    } else {
      return res.status(400).json({ error: '支払いに失敗しました' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/cancel-subscription', async (req, res) => {
  const { subscriptionId } = req.body;
  if (!subscriptionId) return res.status(400).json({ error: 'subscriptionIdが必要です' });
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
    return res.json({
      success: true,
      cancelAt: new Date(subscription.cancel_at * 1000).toLocaleDateString('ja-JP'),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/subscription-status', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'emailが必要です' });
  try {
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return res.json({ plan: 'free' });
    const customer = customers.data[0];
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id, status: 'active', limit: 1,
    });
    if (subscriptions.data.length === 0) return res.json({ plan: 'free' });
    const sub = subscriptions.data[0];
    const priceId = sub.items.data[0].price.id;
    let plan = 'free';
    if (priceId === process.env.STRIPE_PRICE_STANDARD) plan = 'standard';
    if (priceId === process.env.STRIPE_PRICE_TEAM) plan = 'team';
    return res.json({ plan, subscriptionId: sub.id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// === マーケット動向・ニュース監視 ===

// 株価 + ニュースの生スナップショット(AI要約・通知なし)。
app.get('/api/market/snapshot', async (req, res) => {
  try {
    const snapshot = await buildSnapshot();
    return res.json(snapshot);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// その場でダイジェストを生成(AI要約)。?notify=true でSlack配信も行う。
app.post('/api/market/digest', async (req, res) => {
  const notify = req.query.notify === 'true' || req.body?.notify === true;
  try {
    const result = await runDigest({ notify });
    return res.json({
      headline: result.headline,
      text: result.text,
      generatedBy: result.generatedBy,
      delivery: result.delivery,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`MinuteAI バックエンド起動 http://localhost:${PORT}`);
  startScheduler();
});
