{
  "name": "jobtap-engine",
  "version": "1.0.0",
  "description": "JobTap Phase 1 engine: follow-up scheduler, missed-call recovery, SMS compliance, Stripe payments, Tax Drop",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "scheduler": "node src/scheduler.js",
    "test": "node --test tests/engine.test.js",
    "test:db": "bash tests/db.test.sh",
    "test:all": "npm test && npm run test:db"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "express": "^4.19.0",
    "luxon": "^3.5.0",
    "stripe": "^16.0.0",
    "twilio": "^5.3.0"
  }
}