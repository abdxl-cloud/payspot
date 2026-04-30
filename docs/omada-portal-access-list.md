# Omada Portal Access List For PaySpot

This guide explains what tenants should add to Omada's pre-authentication access list so PaySpot and payment checkout can load before the WiFi user has authenticated.

## When This Is Needed

Configure this when:
- users open PaySpot from the captive portal before they have internet access
- the captive page has a `Buy Voucher` button
- Paystack checkout must load inside the captive browser
- Omada is using External Web Portal for RADIUS/account access

You may not need this when:
- the tenant only sells vouchers outside the captive network
- the customer already has a voucher before joining WiFi
- the tenant manually sends vouchers by SMS/WhatsApp and customers only type them into Omada

## Where To Configure It In Omada

For Omada v5.9 to v6:
1. Open the target site.
2. Go to `Site Settings -> Authentication -> Portal`.
3. Open the `Access Control` tab.
4. Enable `Pre-Authentication Access`.
5. Click `Add`.
6. Choose `URL` or `IP Range`.
7. Add only the required PaySpot/payment entries.
8. Save and `Apply`.

For Omada v6.2 and newer:
1. Open `Site View`.
2. Go to `Network Config -> Authentication -> Portal -> Access Control`.
3. Enable `Pre-Authentication Access`.
4. Add `URL` or `IP Range` entries.
5. Save and `Apply`.

## Official Omada Screenshots

Access Control tab:

![Omada Access Control tab](/help/omada-access-list/access-control-tab.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-15_20241024094058j.png

Enable Pre-Authentication Access and click Add:

![Omada Pre-Authentication Access enabled](/help/omada-access-list/preauth-enable.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-16_20241024094057w.png

Choose URL or IP Range:

![Omada Add Pre-Authentication Access Entry type selector](/help/omada-access-list/add-entry-type.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-17_20241024094057p.png

Save the access entry:

![Omada Save Pre-Authentication Access Entry](/help/omada-access-list/save-entry.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-18_20241024094057g.png

Newer Omada Network UI:

![Omada v6 Pre-Authentication Access Entry](/help/omada-access-list/v6-preauth-entry.png)

Source image: https://static.tp-link.com/upload/faq/image_20251204012713o.png

## Minimum Entries

Add the tenant's PaySpot store domain:

```text
payspot.abdxl.cloud
```

If the tenant uses a custom domain, add that instead or in addition:

```text
wifi.example.com
```

If the custom portal page is hosted somewhere else, add that host too:

```text
portal.example.com
```

## Payment Checkout Entries

Paystack checkout must be reachable before authentication. Add the exact Paystack hosts used during checkout in your market/test.

Start with:

```text
checkout.paystack.com
paystack.com
```

If the controller supports wildcard/domain suffix entries, add Paystack subdomains according to the controller UI rules:

```text
*.paystack.com
```

If checkout still does not load, inspect the failed browser/network request from a captive test phone and add the missing Paystack host exactly. Keep the list narrow.

## External RADIUS Browserauth Entries

For External Web Portal + RADIUS account access, PaySpot returns the browser to the Omada controller endpoint:

```text
/portal/radius/browserauth
```

Usually this is a controller-local URL from Omada's own redirect parameters. If the browser cannot submit back to Omada, add the controller IP or hostname shown in the Omada `target` parameter.

Examples:

```text
192.168.1.21
omada-controller.example.local
```

Only add this if the captive browser test shows that the client cannot reach the Omada controller endpoint.

## Do Not Add Broad Internet Access

Avoid adding:
- `google.com`
- Apple/Android captive-check domains
- broad public DNS IPs
- `0.0.0.0/0`
- the whole internet

Those entries can make phones believe they are already online or can bypass the intended captive flow.

## Validation Checklist

1. Join the hotspot as a new unauthenticated client.
2. Confirm the captive page opens.
3. Click `Buy Voucher` or open the PaySpot store.
4. Select a plan and start checkout.
5. Confirm Paystack loads.
6. Complete payment.
7. Confirm the voucher or account login result appears.
8. Confirm the customer can authenticate and browse.

## Official Omada References

- Omada v5.9 to v6 portal guide: https://support.omadanetworks.com/cac/document/13285/
- Omada v6.2+ portal guide: https://support.omadanetworks.com/en/document/111643/
