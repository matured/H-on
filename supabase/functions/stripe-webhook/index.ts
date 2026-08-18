// Stripe calls this directly (not the browser) when a Checkout Session's
// payment finishes. Verifies the webhook signature before trusting
// anything in the payload, then marks the matching contributions row
// complete. This is the only place a contribution is ever confirmed —
// the client redirecting to successUrl means "Stripe said it worked",
// not proof the money actually moved.

import Stripe from "npm:stripe@18";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { error } = await supabase
      .from("contributions")
      .update({
        status: "complete",
        completed_at: new Date().toISOString(),
        stripe_customer_email: session.customer_details?.email ?? null,
      })
      .eq("stripe_session_id", session.id);

    if (error) {
      console.error("Failed to record completed contribution:", error);
      return new Response("Database update failed", { status: 500 });
    }
  }

  if (event.type === "checkout.session.expired") {
    await supabase
      .from("contributions")
      .update({ status: "expired" })
      .eq("stripe_session_id", event.data.object.id);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
