import { Analytics } from './index.js'

// Sends two real events and shows the API refusing an unmapped one.
try {
  process.loadEnvFile('../.env')
} catch {
  // No .env means the defaults below, which match the API's own defaults.
}

const analytics = new Analytics({
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',
  writeKey: process.env.WRITE_KEY ?? 'demo_write_key',
})

await analytics.identify('usr_sdk_demo', { plan: 'pro', platform: 'web' })
analytics.track('report_opened', { report: 'Weekly revenue' })
analytics.track('report_exported', { report: 'Weekly revenue', format: 'pdf' })
await analytics.flush()
console.log('Sent report_opened and report_exported for usr_sdk_demo')

analytics.track('made_up_event')
await analytics.flush().catch((error) => console.log(`Refused as expected: ${error.message}`))
