// Creates a Stripe Checkout Session for a one-time contribution from
// support.html's "Become a Supporter" page and returns its hosted URL.
// The browser never sees a Stripe secret key: this function holds it as a
// server-side env var and only ever hands back a redirect URL.
//
// Called with the Supabase anon key as the Authorization bearer (see
// js in support.html) — donors are not required to be signed in.

import Stripe from "npm:stripe@18";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  try {
    const { amount, successUrl, cancelUrl } = await req.json();

    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars < 1 || !Number.isInteger(dollars)) {
      throw new Error("amount must be a whole-dollar number >= 1");
    }
    if (typeof successUrl !== "string" || typeof cancelUrl !== "string") {
      throw new Error("successUrl and cancelUrl are required");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Contribution to 本 (hon)",
              description: "One-time support for a circulating archive of Japanese print media.",
            },
            unit_amount: dollars * 100,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const { error: insertError } = await supabase.from("contributions").insert({
      stripe_session_id: session.id,
      amount_cents: dollars * 100,
      status: "pending",
    });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message ?? String(err) }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
