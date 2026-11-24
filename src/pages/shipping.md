---
title: Shipping policy
description: Shipping times, charges and delivery details for Speed Wheels orders across India.
updated: 24 November 2026
---
**Where we ship.** We ship to all serviceable PIN codes in India through trusted courier partners.

**Processing time.** Orders are packed and dispatched within {{ shipping.dispatchDays }} of payment confirmation.

**Delivery time.** After dispatch, delivery usually takes {{ shipping.deliveryDays }} depending on your location.

**Shipping charges.** Shipping is {{ shipping.defaultRate | inr }} per order{% for z in shipping.zones %}, or {{ z.rate | inr }} to {{ z.name }}{% endfor %}.{% if shipping.freeAbove %} Shipping is free on orders of {{ shipping.freeAbove | inr }} or more.{% endif %} The exact shipping charge is shown at checkout before you pay.

**Tracking.** Once your order ships, we will email you the courier name and tracking number. You can also check your order any time on our [Track your order](/track/) page.

**Damaged in transit.** If your parcel arrives damaged, please record an unboxing video and message us within 48 hours of delivery. We will send a replacement free of charge.

**Questions?** [Contact us](/contact/).
