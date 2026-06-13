import express, { Request } from "express";
import Stripe from "stripe";
import type { Checkout as StripeType } from "stripe";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import cors from "cors";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(
  cors({
    origin:
      process.env.ENV === "dev"
        ? process.env.frontend_host_dev
        : process.env.ENV === "staging"
        ? process.env.frontend_host_staging
        : process.env.frontend_host_prod,
  })
);

app.use(express.urlencoded());

const stripeSecretKey =
  process.env.ENV === "dev" || process.env.ENV === "staging"
    ? process.env.stripe_secret_key_dev || ""
    : process.env.stripe_secret_key_prod || "";

const stripe = new Stripe(stripeSecretKey);

async function fulfillCheckout(sessionId: string) {
  // Don't put any keys in code. See https://docs.stripe.com/keys-best-practices.
  // Find your keys at https://dashboard.stripe.com/apikeys.
  const stripe = require("stripe")(stripeSecretKey);

  console.log("Fulfilling Checkout Session " + sessionId);

  // TODO: Make this function safe to run multiple times,
  // even concurrently, with the same session ID

  // TODO: Make sure fulfillment hasn't already been
  // performed for this Checkout Session

  // Retrieve the Checkout Session from the API with line_items expanded
  const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });

  const metadata = checkoutSession.metadata;
  console.log("metadata", metadata);
  // Check the Checkout Session's payment_status property
  // to determine if fulfillment should be performed
  if (checkoutSession.payment_status !== "unpaid") {
    // TODO: Perform fulfillment of the line items
    // TODO: Record/save fulfillment status for this
    // Checkout Session
  }
}

app.post(
  "/stripe_webhooks",
  express.raw({ type: "application/json" }),
  (request, response) => {
    const endpointSecret =
      (process.env.ENV === "dev"
        ? process.env.dev_web_hook_secret
        : process.env.ENV === "staging"
        ? process.env.staging_web_hook_secret
        : process.env.prod_web_hook_secret) || "";

    const payload = request.body;
    const sig = request.headers["stripe-signature"] || "";

    let event;

    try {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
      //@ts-ignore
      return response.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      fulfillCheckout(event.data.object.id);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      console.log("payment failed");
    }
  }
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("hello world");
});

type CreateSessionParams = {
  email: string;
  senderName: string;
  giftRecipientName: string;
  giftRecipientEmail: string;
  giftCardId: string;
};
app.post(
  "/create-session",
  async (req: Request<{}, {}, CreateSessionParams>, res) => {
    const FRONTEND_HOST =
      process.env.ENV === "dev"
        ? process.env.frontend_host_dev
        : process.env.ENV === "staging"
        ? process.env.frontend_host_staging
        : process.env.frontend_host_prod;

    const orderId = randomUUID();
    const {
      email,
      giftRecipientEmail,
      giftCardId,
      senderName,
      giftRecipientName,
    } = req.body;

    if (
      !email ||
      !giftRecipientEmail ||
      !giftCardId ||
      !senderName ||
      !giftRecipientName
    ) {
      return res.json({
        error: true,
        message:
          "no valid email/giftRecipient/giftCardId/senderName/giftRecipientName provided",
      });
    }

    //TODO://get gift card from Mongodb
    const giftCardDetails = {
      giftCardId: 101,
      name: "£50 gift card",
      price: 50,
    };

    const lineItem: StripeType.SessionCreateParams.LineItem = {
      price_data: {
        currency: "gbp",
        product_data: {
          name: giftCardDetails.name,
          description: `orderId:${orderId}`,
        },
        unit_amount: Number(giftCardDetails.price) * 100,
      },
      quantity: 1,
    };

    const session = await stripe.checkout.sessions.create({
      line_items: [lineItem],
      customer_email: email,
      mode: "payment",
      client_reference_id: orderId,
      metadata: {
        orderId,
        senderName,
        email,
        giftRecipientName,
        giftRecipientEmail,
        giftCardDetailsId: giftCardDetails.giftCardId,
        giftCardName: giftCardDetails.name,
        giftCardPrice: giftCardDetails.price,
      },
      success_url: `${FRONTEND_HOST}/gift_success?orderId=${orderId}&email=${email}`,
      cancel_url: `${FRONTEND_HOST}/gift_card?cancelled=true`,
    });

    res.send({
      url: session.url,
    });
  }
);

app.listen(port, () => {
  console.log(`Server running on localhost:${port}`);
});

//stripe listen --forward-to localhost:3000/stripe_webhooks
//stripe login
//stripe listen --forward-to http://localhost:3000/stripe_webhooks
//stripe trigger checkout.session.completed
//stripe listen --events checkout.session.completed --forward-to http://localhost:3000/stripe_webhooks
