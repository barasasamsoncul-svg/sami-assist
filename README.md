# SaMi Invoicing v4

This replacement updates the invoice detail workspace with:

- Dark-mode-safe Record Payment modal with explicit readable labels, inputs and buttons.
- Record payment POST to `/api/invoices/[id]/payments`.
- Export menu: Print / Save as PDF and CSV download.
- Share invoice dialog.
- WhatsApp sharing with the customer's saved phone number prefilled and editable.
- Email sharing with the customer's saved email prefilled and editable.
- Optional additional message/details before sharing.
- Copy-message action.
- Invoice/customer/payment information is taken from the existing invoice API response/database-backed data.

Replace the existing component at `app/components/layout/invoices.tsx` with the included file.
