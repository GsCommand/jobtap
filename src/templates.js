// Default SMS templates. Copied into message_templates per business at onboarding.
// Variables: {first_name} {business_name} {business_phone} {quote_link} {pay_link}
//            {review_link} {eta} {amount} {quote_form_link}
// Every outbound marketing-class message appends opt-out language automatically (see twilio.js).

module.exports = {
  missed_call_textback:
    "Hi, this is {business_name} — so sorry we missed your call! We're on a job right now but WILL call you back shortly. If you'd like a quote in the meantime, tap here and we'll get right on it: {quote_form_link}",

  on_the_way:
    "Hi {first_name}, it's {business_name} — we're on the way to you now, ETA about {eta}. See you soon!",

  quote:
    "Hi {first_name}, your quote from {business_name} is ready. View and approve here: {quote_link}",

  quote_followup_d1:
    "Hi {first_name}, just making sure your quote from {business_name} came through OK. Any questions, just reply here! {quote_link}",

  quote_followup_d3:
    "Hi {first_name}, {business_name} here — wanted to check in on your quote. Happy to adjust anything or answer questions. {quote_link}",

  quote_followup_d7:
    "Hi {first_name}, last check-in from {business_name} on your quote — our schedule is filling up, so grab your spot if you're ready: {quote_link}",

  invoice:
    "Hi {first_name}, your invoice from {business_name} is ready — {amount}. Pay securely here: {pay_link}",

  invoice_reminder_d3:
    "Hi {first_name}, friendly reminder your invoice from {business_name} ({amount}) is ready: {pay_link}",

  invoice_reminder_d7:
    "Hi {first_name}, following up on your invoice from {business_name} ({amount}). Pay anytime here: {pay_link}",

  invoice_reminder_d14:
    "Hi {first_name}, final reminder on your open invoice from {business_name} ({amount}). Please pay or reply here so we can help: {pay_link}",

  d3_review:
    "Hi {first_name}! Thanks again for choosing {business_name}. If you're happy with how it turned out, a quick review means the world to a small business: {review_link}",

  d30_checkin:
    "Hi {first_name}, {business_name} here — just checking in a month later. Everything still looking great? Reply here if you need anything at all.",

  d60_referral:
    "Hi {first_name}! If you know a neighbor who'd love the same results, send them our way — we take great care of referrals. {business_name}, {business_phone}",

  d90_rebook:
    "Hi {first_name}, {business_name} here. It's a good time to keep your surfaces protected — want us to swing by for a quick check or touch-up?",

  d180_seasonal:
    "Hi {first_name}! Season's changing — a great time for maintenance. {business_name} is booking now if you'd like a spot.",

  d270_touch:
    "Hi {first_name}, {business_name} checking in — hope everything is still looking sharp! We're here whenever you need us.",

  d365_annual:
    "Hi {first_name}, it's been about a year since your service with {business_name} — the perfect time for your annual maintenance. Want us to get you on the schedule?",

  reschedule:
    "Hi {first_name}, {business_name} here — we need to adjust your appointment. Your new time is {eta}. Reply if that doesn't work and we'll find a better slot.",

  rain_delay:
    "Hi {first_name}, {business_name} here — rain is forecast for your appointment day, and this work needs dry conditions to be done right. We'd like to move you to {eta}. Reply YES to confirm or let us know a better time."
};
