import { Router } from 'express';
import { prisma } from '@cricket-os/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

export const paymentsRouter = Router();

// POST /api/v1/payments/checkout — create Stripe checkout session
paymentsRouter.post('/checkout', requireAuth, async (req: AuthRequest, res, next) => {
  try {
    const { leagueId, teamId } = req.body;

    const league = await prisma.league.findUnique({ where: { id: leagueId } });
    if (!league) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'League not found' } });

    if (league.registrationFee === 0) {
      // Free registration — mark directly as paid
      await prisma.leagueTeam.update({
        where: { leagueId_teamId: { leagueId, teamId } },
        data: { paymentStatus: 'PAID' },
      });
      return res.json({ success: true, data: { url: null, free: true } });
    }

    // In production: integrate Stripe here
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const session = await stripe.checkout.sessions.create({ ... });
    // For MVP, return a mock session
    const payment = await prisma.payment.create({
      data: {
        leagueId,
        teamId,
        userId: req.user!.id,
        amount: league.registrationFee,
        currency: league.currency,
        status: 'PENDING',
        stripeSessionId: `mock_session_${Date.now()}`,
      },
    });

    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        url: `/payments/mock-checkout/${payment.id}`,
        amount: league.registrationFee,
        currency: league.currency,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/payments/webhook — Stripe webhook handler
paymentsRouter.post('/webhook', async (req, res, next) => {
  try {
    // In production: verify Stripe signature
    const { type, data } = req.body;

    if (type === 'checkout.session.completed') {
      const session = data.object;
      const payment = await prisma.payment.findUnique({ where: { stripeSessionId: session.id } });
      if (payment) {
        await prisma.$transaction([
          prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID', paidAt: new Date(), stripePaymentId: session.payment_intent },
          }),
          prisma.leagueTeam.update({
            where: { leagueId_teamId: { leagueId: payment.leagueId, teamId: payment.teamId } },
            data: { paymentStatus: 'PAID' },
          }),
        ]);
      }
    }

    res.json({ received: true });
  } catch (err) { next(err); }
});
