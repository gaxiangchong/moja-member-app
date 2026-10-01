/** Opens a WhatsApp chat with `number` (digits, with country code) and a ready-typed message. */
export function whatsappUrl(number: string, text: string): string {
  const digits = number.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export type DeliveryChatDetails = {
  /** Known once the order is placed; before that the message is a general enquiry. */
  orderNumber?: number | null;
  address: string;
  contactName: string;
  contactPhone: string;
  date?: string | null;
  time?: string | null;
};

/** The message the member sends Moja Maison to get a delivery partner arranged. */
export function deliveryWhatsappMessage(d: DeliveryChatDetails): string {
  const lines = [
    'Hi Moja Maison, I would like help arranging a delivery partner' +
      (d.orderNumber ? ` for my order #${d.orderNumber}.` : '.'),
    '',
    `Deliver to: ${d.address}`,
    `Contact: ${d.contactName} · ${d.contactPhone}`,
  ];
  if (d.date || d.time) {
    lines.push(`Courier pick-up from the shop: ${[d.date, d.time].filter(Boolean).join(' ')}`);
  }
  lines.push('', 'Please let me know the delivery charge so I can pay it before delivery is arranged.');
  return lines.join('\n');
}

/** Shown wherever a member picks or reviews delivery. */
export const DELIVERY_CHARGE_NOTICE =
  'The delivery charge is not part of your order total. It has to be paid before we can arrange the delivery.';
