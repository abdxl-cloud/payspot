# Custom Captive Portal Page For PaySpot

This guide explains how to use a custom Omada captive portal page with PaySpot.

There are two common setups:

1. Omada voucher portal with a PaySpot purchase link.
2. Omada External Web Portal with RADIUS/account access.

## Option A: Omada Voucher Portal With PaySpot Purchase Link

Use this when:
- Omada still authenticates customers with voucher codes
- PaySpot sells the voucher codes online
- vouchers are supplied through CSV import or Omada OpenAPI

The captive page should have:
- the normal Omada voucher input/login area
- a clear `Buy Voucher` button that opens PaySpot

PaySpot URL:

```text
https://payspot.abdxl.cloud/t/<tenant-slug>
```

Optional voucher check page:

```text
https://payspot.abdxl.cloud/t/<tenant-slug>/voucher
```

Example HTML link:

```html
<a href="https://payspot.abdxl.cloud/t/wallstreet">
  Buy WiFi Voucher
</a>
```

Before testing, configure the Omada pre-authentication access list for PaySpot and Paystack.

## Official Omada Portal Customization Screenshots

Import a customized portal page:

![Omada Import Customized Page](/help/custom-portal/import-customized-page.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-10_20241024094057j.png

Edit the current Omada portal page:

![Omada Edit Current Page](/help/custom-portal/edit-current-page.png)

Source image: https://static.tp-link.com/upload/faq/image-20241024174056-11_20241024094057p.png

## Option B: External Web Portal With RADIUS Account Access

Use this when:
- customers sign up or log in through PaySpot
- PaySpot tracks subscriptions/entitlements
- an external RADIUS server enforces access
- Omada should redirect unauthenticated clients to PaySpot

Omada portal settings:

```text
Authentication Type: RADIUS Server
Portal Customization: External Web Portal
External Web Portal URL: https://payspot.abdxl.cloud/t/<tenant-slug>
Landing Page: The Original URL
```

PaySpot reads Omada's query parameters such as:

```text
target
targetPort
clientMac
clientIp
apMac
gatewayMac
ssidName
radioId
vid
originUrl
```

After login/payment, PaySpot prepares the browserauth response so the customer's browser can submit back to Omada:

```text
POST /portal/radius/browserauth
```

Official External Web Portal flow:

![Omada External Web Portal flow](/help/custom-portal/external-web-portal-flow.png)

Source image: https://static.tp-link.com/upload/faq/image-20240329073747-2_20240329143747k.png

## Important Limitations

- External Web Portal in Omada is tied to RADIUS-style authentication flows.
- PaySpot is not the Omada controller. For account access, a RADIUS service or adapter must still exist and call PaySpot's RADIUS endpoints.
- The customer device must be able to reach PaySpot before authentication, so the pre-authentication access list is required.
- Paystack checkout hosts must also be reachable before authentication.

## What To Add To The Custom Page

For voucher mode:
- business name/logo
- plan summary
- `Buy Voucher` link to PaySpot
- Omada voucher login form or existing voucher input
- support phone/WhatsApp

For account access mode:
- PaySpot external portal URL as the portal URL
- no separate voucher input unless you intentionally support voucher fallback
- landing page set to original URL if users should return to the site they first opened

## Testing Checklist

1. Open a private/incognito browser on a phone.
2. Forget the WiFi network and reconnect fresh.
3. Confirm Omada opens the custom captive page.
4. Click `Buy Voucher` or complete PaySpot account login.
5. Confirm checkout works while unauthenticated.
6. Confirm Omada accepts the voucher/RADIUS login.
7. Confirm the phone can browse the internet.

## Official Omada References

- Omada v5.9 to v6 portal guide: https://support.omadanetworks.com/cac/document/13285/
- Omada External Web Portal API flow: https://support.omadanetworks.com/cac/document/13025/
