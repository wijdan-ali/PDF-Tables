# Pricing UI – Copy-Paste Ready (No Animations, Generic Fonts)

Use this markup and CSS in another project to get the same three pricing options UI: **two paid cards side-by-side** and **one free trial card** below, plus header, monthly/yearly toggle, and trust row.

---

## 1. HTML / JSX Structure

Use this structure. Class names match the CSS below. Replace `#` with your CTA URLs.

```html
<section id="pricing" class="pricing-section">
  <!-- Section Header -->
  <div class="pricing-header-block">
    <h2 class="pricing-section-heading">Pricing</h2>
    <p class="pricing-section-desc">All plans include our core AI extraction technology.</p>
  </div>

  <!-- Billing Toggle -->
  <div class="pricing-toggle-wrap">
    <span class="pricing-toggle-label" data-active="monthly">Monthly</span>
    <button type="button" class="billing-toggle" aria-label="Toggle billing period">
      <span class="billing-toggle-knob billing-toggle-yearly"></span>
    </button>
    <span class="pricing-toggle-label" data-active="yearly">Yearly</span>
    <span class="billing-save-badge">Save 20%</span>
  </div>

  <!-- Paid Plans - Two cards side by side -->
  <div class="pricing-grid">
    <!-- Card 1: Starter (light) -->
    <div class="pricing-card pricing-card-light">
      <div class="pricing-card-inner">
        <h3 class="pricing-card-title pricing-card-title-light">Starter</h3>
        <p class="pricing-card-desc pricing-card-desc-light">Perfect for individuals and small projects</p>
        <div class="pricing-price-block">
          <span class="pricing-price-old">$29</span>
          <span class="pricing-price-current">$19</span>
          <span class="pricing-price-period">/month</span>
        </div>
        <p class="pricing-price-note pricing-price-note-light">Save $10/month</p>
        <ul class="pricing-features">
          <li class="pricing-feature included"><span class="pricing-feature-icon check"></span>200 documents/month</li>
          <li class="pricing-feature included"><span class="pricing-feature-icon check"></span>Custom column definitions</li>
          <li class="pricing-feature excluded"><span class="pricing-feature-icon cross"></span>Batch processing</li>
          <li class="pricing-feature excluded"><span class="pricing-feature-icon cross"></span>Priority support</li>
        </ul>
        <a href="#" class="pricing-btn-gradient">Get Started</a>
      </div>
    </div>

    <!-- Card 2: Professional (gradient, popular) -->
    <div class="pricing-card pricing-card-gradient">
      <div class="pricing-badge"><span class="pricing-badge-text">Most Popular</span></div>
      <div class="pricing-card-inner">
        <h3 class="pricing-card-title pricing-card-title-dark">Professional</h3>
        <p class="pricing-card-desc pricing-card-desc-dark">For teams that need power and flexibility</p>
        <div class="pricing-price-block">
          <span class="pricing-price-old pricing-price-old-dark">$79</span>
          <span class="pricing-price-current pricing-price-current-dark">$49</span>
          <span class="pricing-price-period pricing-price-period-dark">/month</span>
        </div>
        <p class="pricing-price-note pricing-price-note-dark">Billed $588/year · Save $120/year</p>
        <ul class="pricing-features">
          <li class="pricing-feature included highlight"><span class="pricing-feature-icon check dark"></span>Unlimited documents</li>
          <li class="pricing-feature included"><span class="pricing-feature-icon check dark"></span>Custom column definitions</li>
          <li class="pricing-feature included"><span class="pricing-feature-icon check dark"></span>Batch processing</li>
          <li class="pricing-feature included"><span class="pricing-feature-icon check dark"></span>Priority support</li>
        </ul>
        <a href="#" class="pricing-btn-light">Start Free Trial</a>
      </div>
    </div>
  </div>

  <!-- Free Trial - Full width below -->
  <div class="pricing-card-free">
    <div class="pricing-card-free-inner">
      <div class="pricing-card-free-content">
        <div class="pricing-card-free-header">
          <h3 class="pricing-card-free-title">Free Trial</h3>
          <span class="pricing-free-badge">No Credit Card</span>
        </div>
        <p class="pricing-card-free-desc">Try Clariparse risk-free. No credit card required.</p>
        <div class="pricing-card-free-features">
          <span class="pricing-free-feature"><span class="pricing-feature-icon check"></span>50 documents included</span>
          <span class="pricing-free-feature"><span class="pricing-feature-icon check"></span>All Professional features</span>
          <span class="pricing-free-feature"><span class="pricing-feature-icon check"></span>No credit card required</span>
        </div>
      </div>
      <a href="#" class="pricing-btn-gradient-large">Start Free Trial</a>
    </div>
  </div>

  <!-- Trust row -->
  <div class="pricing-trust">
    <div class="pricing-trust-inner">
      <span class="pricing-trust-item"><svg class="pricing-trust-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 18.333c4.6 0 8.333-3.733 8.333-8.333S14.6 1.667 10 1.667 1.667 5.4 1.667 10s3.733 8.333 8.333 8.333z"/><path d="M7.5 10l1.667 1.667L12.5 8.333" stroke-linecap="round" stroke-linejoin="round"/></svg>Cancel anytime</span>
      <span class="pricing-trust-item"><svg class="pricing-trust-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15.833 8.333h-11.666c-.92 0-1.667.747-1.667 1.667v6.667c0 .92.746 1.666 1.667 1.666h11.666c.92 0 1.667-.746 1.667-1.666V10c0-.92-.746-1.667-1.667-1.667z"/><path d="M5.833 8.333V5a4.167 4.167 0 118.334 0v3.333" stroke-linecap="round"/></svg>Secure payment</span>
    </div>
  </div>
</section>
```

For **React**: keep the same class names; you can keep the toggle state and switch price/period text and the `billing-toggle-yearly` class on the knob. The CSS does not depend on animations.

---

## 2. CSS (No animations, generic font)

Copy this entire block. Uses `system-ui` (no SF Pro). No opacity/transform/transition for “animate-in”; only hover transitions for buttons and cards.

```css
/* ----- Section layout ----- */
.pricing-section {
  padding: 4rem 1.5rem 6rem;
  max-width: 56rem;
  margin: 0 auto;
}

.pricing-header-block {
  text-align: center;
  margin-bottom: 2rem;
}

.pricing-section-heading {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 700;
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #000 0%, #000 40%, #949494 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: #1a1a1a;
  margin-bottom: 0.5rem;
}

.pricing-section-desc {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.125rem;
  color: #555;
  max-width: 36rem;
  margin: 0 auto;
}

/* ----- Toggle ----- */
.pricing-toggle-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-bottom: 3rem;
}

.pricing-toggle-label {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  color: #888;
}

.pricing-toggle-label[data-active="yearly"] {
  color: #1a1a1a;
  font-weight: 500;
}

.billing-toggle {
  position: relative;
  width: 56px;
  height: 30px;
  background: #e5e5e5;
  border-radius: 15px;
  cursor: pointer;
  border: none;
  padding: 0;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}

.billing-toggle:hover {
  background: #dbdbdb;
}

.billing-toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  background: linear-gradient(145deg, #fff 0%, #f5f5f5 100%);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: transform 300ms ease;
}

.billing-toggle-yearly {
  transform: translateX(26px);
}

.billing-save-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: linear-gradient(135deg, rgba(124, 144, 130, 0.15) 0%, rgba(124, 144, 130, 0.25) 100%);
  border-radius: 20px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: #5a6a5f;
  margin-left: 4px;
}

/* ----- Grid: two paid cards ----- */
.pricing-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-bottom: 2rem;
}

@media (max-width: 768px) {
  .pricing-grid {
    grid-template-columns: 1fr;
  }
}

/* ----- Base card ----- */
.pricing-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 2rem;
  border-radius: 20px;
  transition: box-shadow 300ms ease;
}

.pricing-card-light {
  background: #fafafa;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow:
    inset 4px 0 8px -4px rgba(255, 255, 255, 0.8),
    inset -4px 0 8px -4px rgba(255, 255, 255, 0.8),
    inset 0 4px 8px -4px rgba(255, 255, 255, 0.8),
    inset 0 -4px 8px -4px rgba(255, 255, 255, 0.8),
    0 4px 20px -4px rgba(0, 0, 0, 0.05);
}

.pricing-card-light:hover {
  box-shadow:
    inset 4px 0 8px -4px rgba(255, 255, 255, 0.8),
    inset -4px 0 8px -4px rgba(255, 255, 255, 0.8),
    inset 0 4px 8px -4px rgba(255, 255, 255, 0.8),
    inset 0 -4px 8px -4px rgba(255, 255, 255, 0.8),
    0 8px 30px -4px rgba(0, 0, 0, 0.08);
}

.pricing-card-gradient {
  background: linear-gradient(145deg, #bfc9bb 0%, #7c9082 60%);
  border: none;
  box-shadow:
    inset 6px 0 12px -4px rgba(255, 255, 255, 0.25),
    inset -6px 0 12px -4px rgba(255, 255, 255, 0.25),
    inset 0 4px 10px -4px rgba(255, 255, 255, 0.2),
    inset 0 -4px 10px -4px rgba(255, 255, 255, 0.15),
    0 8px 30px -4px rgba(100, 120, 100, 0.25);
}

.pricing-card-gradient:hover {
  box-shadow:
    inset 8px 0 14px -4px rgba(255, 255, 255, 0.3),
    inset -8px 0 14px -4px rgba(255, 255, 255, 0.3),
    inset 0 5px 12px -4px rgba(255, 255, 255, 0.25),
    inset 0 -5px 12px -4px rgba(255, 255, 255, 0.2),
    0 12px 40px -4px rgba(100, 120, 100, 0.35);
}

.pricing-badge {
  position: absolute;
  top: -12px;
  left: 50%;
  transform: translateX(-50%);
  background: #1a1a1a;
  padding: 6px 16px;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.pricing-badge-text {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #fff;
}

.pricing-card-inner {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.pricing-card-title {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.pricing-card-title-light { color: #1a1a1a; }
.pricing-card-title-dark { color: #fff; }

.pricing-card-desc {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}

.pricing-card-desc-light { color: #555; }
.pricing-card-desc-dark { color: rgba(255, 255, 255, 0.7); }

.pricing-price-block {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.pricing-price-old {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.25rem;
  color: #999;
  text-decoration: line-through;
}

.pricing-price-old-dark { color: rgba(255, 255, 255, 0.4); }

.pricing-price-current {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 700;
  font-size: 3rem;
  color: #1a1a1a;
}

.pricing-price-current-dark { color: #fff; }

.pricing-price-period {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 1.125rem;
  color: #555;
}

.pricing-price-period-dark { color: rgba(255, 255, 255, 0.7); }

.pricing-price-note {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  margin-bottom: 2rem;
  min-height: 1.5rem;
}

.pricing-price-note-light { color: #7c9082; }
.pricing-price-note-dark { color: rgba(255, 255, 255, 0.6); }

.pricing-features {
  list-style: none;
  padding: 0;
  margin: 0 0 2rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex-grow: 1;
}

.pricing-feature {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 15px;
}

.pricing-feature.included { color: #333; }
.pricing-feature.included.highlight { font-weight: 500; }
.pricing-feature.excluded { color: #999; }

.pricing-card-gradient .pricing-feature.included { color: rgba(255, 255, 255, 0.9); }
.pricing-card-gradient .pricing-feature.excluded { color: rgba(255, 255, 255, 0.4); }

.pricing-feature-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin-top: 2px;
  display: inline-block;
}

.pricing-feature-icon.check {
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M16.667 5L7.5 14.167 3.333 10' stroke='%237C9082' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center;
}

.pricing-feature-icon.check.dark {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M16.667 5L7.5 14.167 3.333 10' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.pricing-feature-icon.cross {
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'%3E%3Cpath d='M15 5L5 15M5 5l10 10' stroke='%23ccc' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat center;
}

/* ----- Buttons ----- */
.pricing-btn-gradient,
.pricing-btn-gradient-large {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 32px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: #fff;
  border-radius: 10px;
  text-decoration: none;
  border: none;
  cursor: pointer;
  background: linear-gradient(140deg, #bfc9bb 0%, #7c9082 50%);
  box-shadow:
    inset 4px 0 10px -2px rgba(255, 255, 255, 0.25),
    inset -4px 0 10px -2px rgba(255, 255, 255, 0.25),
    inset 0 2px 6px -1px rgba(255, 255, 255, 0.15),
    inset 0 -2px 6px -1px rgba(255, 255, 255, 0.15),
    0 2px 8px -2px rgba(100, 120, 100, 0.2);
  transition: transform 260ms ease, box-shadow 260ms ease;
}

.pricing-btn-gradient:hover,
.pricing-btn-gradient-large:hover {
  transform: translateY(-2px);
  box-shadow:
    inset 6px 0 12px -3px rgba(255, 255, 255, 0.3),
    inset -6px 0 12px -3px rgba(255, 255, 255, 0.3),
    0 4px 16px -2px rgba(100, 120, 100, 0.3);
}

.pricing-btn-gradient-large {
  padding: 16px 40px;
  font-size: 16px;
  white-space: nowrap;
}

.pricing-btn-light {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 32px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: #1a1a1a;
  border-radius: 10px;
  text-decoration: none;
  border: none;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.8);
  transition: transform 260ms ease, box-shadow 260ms ease, background 260ms ease;
}

.pricing-btn-light:hover {
  transform: translateY(-2px);
  background: #fff;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.15);
}

/* ----- Free trial card ----- */
.pricing-card-free {
  background: linear-gradient(135deg, rgba(191, 201, 187, 0.08) 0%, rgba(124, 144, 130, 0.08) 100%);
  border: 1px dashed rgba(124, 144, 130, 0.3);
  border-radius: 20px;
  padding: 2rem;
  transition: border-color 300ms ease, background 300ms ease;
}

.pricing-card-free:hover {
  border-color: rgba(124, 144, 130, 0.5);
  background: linear-gradient(135deg, rgba(191, 201, 187, 0.12) 0%, rgba(124, 144, 130, 0.12) 100%);
}

.pricing-card-free-inner {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

@media (min-width: 768px) {
  .pricing-card-free-inner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}

.pricing-card-free-content { flex: 1; }

.pricing-card-free-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.pricing-card-free-title {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 700;
  font-size: 1.5rem;
  color: #1a1a1a;
  margin: 0;
}

.pricing-free-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: rgba(124, 144, 130, 0.15);
  border-radius: 6px;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 500;
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #5a6a5f;
}

.pricing-card-free-desc {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.9375rem;
  color: #555;
  margin-bottom: 1.5rem;
  max-width: 28rem;
}

.pricing-card-free-features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}

.pricing-free-feature {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
  color: #333;
}

.pricing-card-free-features .pricing-feature-icon {
  width: 16px;
  height: 16px;
}

/* ----- Trust row ----- */
.pricing-trust {
  margin-top: 4rem;
  text-align: center;
}

.pricing-trust-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  color: #888;
}

.pricing-trust-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 0.875rem;
}

.pricing-trust-icon {
  flex-shrink: 0;
}
```

---

## 3. Toggle behavior (optional)

- Add a `data-period="monthly"` or `data-period="yearly"` on the section (or a wrapper).
- On toggle click, switch the knob class: add/remove `billing-toggle-yearly` on `.billing-toggle-knob`.
- Toggle `data-active` on the two `.pricing-toggle-label` spans (e.g. `data-active="monthly"` vs `data-active="yearly"`).
- In JS, update the visible prices and notes (e.g. show $15/mo and “Billed $180/year” for Starter when yearly is on).

---

## 4. Summary

| Part              | Classes / elements                                      |
|-------------------|---------------------------------------------------------|
| Section           | `.pricing-section`                                      |
| Header            | `.pricing-header-block`, `.pricing-section-heading`, `.pricing-section-desc` |
| Toggle            | `.billing-toggle`, `.billing-toggle-knob`, `.billing-toggle-yearly`, `.billing-save-badge` |
| Paid cards        | `.pricing-card`, `.pricing-card-light`, `.pricing-card-gradient`, `.pricing-badge` |
| Free trial card   | `.pricing-card-free`, `.pricing-card-free-inner`, `.pricing-free-badge` |
| Buttons           | `.pricing-btn-gradient`, `.pricing-btn-light`, `.pricing-btn-gradient-large` |
| Trust row         | `.pricing-trust`, `.pricing-trust-inner`, `.pricing-trust-item` |

All fonts use `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. No animate-in or SF Pro; layout and visuals match the original three pricing options UI.
