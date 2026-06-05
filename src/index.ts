import express, { Request } from "express";
import Stripe from "stripe";
import type { Checkout as StripeType } from "stripe";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded());

const stripe = new Stripe(
  process.env.ENV === "dev" || process.env.ENV === "staging"
    ? process.env.stripe_secret_key_dev || ""
    : process.env.stripe_secret_key_prod || "" 
);

app.post(
  "/create-session",
  async (req: Request<{}, {}, { email: string , giftRecipient: string, giftCardId: string }>, res) => {
    const FRONTEND_HOST =
      process.env.ENV === "dev"
        ? process.env.frontend_host_dev
        : process.env.ENV === "staging"
        ? process.env.frontend_host_staging
        : process.env.frontend_host_prod;

    const orderId = randomUUID();
    const { email, giftRecipient } = req.body;

    if ((!email || !giftRecipient)) {
      return res.json({
        error: true,
        message: "no valid email/giftRecipient provided",
      });
    }

    const giftCardDetails = {
      giftCardId: 101,
      name: "£50 gift card",
      price: 50
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
        email,
        giftRecipient,
      },
      success_url: `${FRONTEND_HOST}/gift_success?orderId=${orderId}&email=${email}`,
      cancel_url: `${FRONTEND_HOST}/gift_card?cancelled=true`,
    });

    res.send({
      url: session.url,
    });
  }
);
