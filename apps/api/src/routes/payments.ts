import { Router, raw } from 'express';
import Stripe from 'stripe';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';

// ============================================================
// Payments — Stripe Checkout for league registration fees.
//
// IMPORTANT: the /webhook route must receive the RAW request body
// for signature verification. It is registered in index.ts BEFORE
// express.json() and re-applies a raw-body parser locally.
// ============================================================

export const paymentsRouter = Router();

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Live Stripe client. In tests / local-dev without keys, payment routes return
// a controlled "not configured" error rather than crashing on import.
const stripe: Stripe | null = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: '2024-04-10' as any })
  : null;

if (!stripe) {
  // Surface this once at boot so it's obvious in logs.
  logger.warn('[Payments] STRIPE_SECRET_KEY is not set — checkout endpoints will return 503.');
}
if (!stripeWebhookSecret && process.env.NODE_ENV === 'production') {
  logger.error('[Payments] STRIPE_WEBHOOK_SECRET is missing in production — webhook will reject all events.');
}

// POST /api/v1/payments/checkout — create Stripe checkout session
paymentsRouter.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, teamId, successUrl, cancelUrl } = req.body as {
      leagueId?: string; teamId?: string; successUrl?: string; cancelUrl?: string;
    };
    if (!leagueId || !teamId) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'leagueId and teamId are required' } });
    }

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });

    const registration = await prisma.leagueTeam.findUnique({
      where: { leagueId_teamId: { leagueId, teamId } },
    });
    if (!registration) {
      return res.status(404).json({ success: false, error: { code: 'NOT_REGISTERED', message: 'Team is not registered in this league' } });
    }
    if (registration.paymentStatus === 'PAID') {
      return res.json({ success: true, data: { url: null, alreadyPaid: true } });
    }

    if (league.registrationFee === 0) {
      await prisma.leagueTeam.update({
        where: { leagueId_teamId: { leagueId, teamId } },
        data: { paymentStatus: 'PAID' },
      });
      return res.json({ success: true, data: { url: null, free: true } });
    }

    if (!stripe) {
      return res.status(503).json({
        success: false,
        error: { code: 'PAYMENTS_DISABLED', message: 'Payments are not configured on this server.' },
      });
    }

    // Reuse an existing pending payment row if present — avoids duplicate
    // Stripe sessions if the user retries.
    const existing = await prisma.payment.findFirst({
      where: { leagueId, teamId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: league.currency.toLowerCase(),
            product_data: { name: `${league.name} — Team registration` },
            unit_amount: league.registrationFee,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl ?? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/league/${league.slug}?paid=1`,
      cancel_url:  cancelUrl  ?? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/league/${league.slug}?paid=0`,
      metadata: { leagueId, teamId, userId: req.user!.id },
      client_reference_id: existing?.id,
    });

    const payment = existing
      ? await prisma.payment.update({
          where: { id: existing.id },
          data:  { stripeSessionId: session.id, amount: league.registrationFee, currency: league.currency },
        })
      : await prisma.payment.create({
          data: {
            leagueId, teamId,
            userId:   req.user!.id,
            amount:   league.registrationFee,
            currency: league.currency,
            status:   'PENDING',
            stripeSessionId: session.id,
          },
        });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        url:      session.url,
        amount:   league.registrationFee,
        currency: league.currency,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/payments/webhook — Stripe webhook
// MUST receive the raw request body so the signature can be verified.
// In production, an unsigned/invalid request is rejected with 400.
export const stripeWebhookHandler = [
  raw({ type: 'application/json', limit: '1mb' }),
  async (req: any, res: any, next: any) => {
    try {
      if (!stripe || !stripeWebhookSecret) {
        return res.status(503).json({ received: false, error: 'Payments not configured' });
      }
      const sig = req.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return res.status(400).json({ received: false, error: 'Missing Stripe-Signature header' });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, stripeWebhookSecret);
      } catch (verifyErr: any) {
        logger.warn({ err: verifyErr?.message }, '[Payments] Webhook signature verification failed');
        return res.status(400).json({ received: false, error: 'Invalid signature' });
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const payment = session.id
          ? await prisma.payment.findUnique({ where: { stripeSessionId: session.id } })
          : null;
        if (payment) {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data:  {
                status: 'PAID',
                paidAt: new Date(),
                stripePaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
              },
            }),
            prisma.leagueTeam.update({
              where: { leagueId_teamId: { leagueId: payment.leagueId, teamId: payment.teamId } },
              data:  { paymentStatus: 'PAID' },
            }),
          ]);
          logger.info({ paymentId: payment.id, leagueId: payment.leagueId }, 'Payment completed');
        }
      } else if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.id) {
          const payment = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } });
          if (payment) {
            await prisma.payment.update({
              where: { id: payment.id },
              data:  { status: 'FAILED', failureReason: event.type },
            });
          }
        }
      }

      res.json({ received: true });
    } catch (err) { next(err); }
  },
];
