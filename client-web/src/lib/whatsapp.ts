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

/** The message the member sends Moja Maison with a question about their delivery order. */
export function deliveryWhatsappMessage(d: DeliveryChatDetails): string {
  const lines = [
    'Hi Moja Maison, I have a question about my delivery order' +
      (d.orderNumber ? ` #${d.orderNumber}.` : '.'),
    '',
    `Deliver to: ${d.address}`,
    `Contact: ${d.contactName} · ${d.contactPhone}`,
  ];
  if (d.date || d.time) {
    lines.push(`Courier pick-up from the shop: ${[d.date, d.time].filter(Boolean).join(' ')}`);
  }
  return lines.join('\n');
}

/** The message a member sends Moja Maison about a pickup their own courier will collect. */
export function courierPickupWhatsappMessage(d: {
  orderNumber?: number | null;
  date?: string | null;
  time?: string | null;
}): string {
  const lines = [
    'Hi Moja Maison, I have a question about my order' +
      (d.orderNumber ? ` #${d.orderNumber}` : '') +
      '. My own courier will collect it from the shop.',
  ];
  if (d.date || d.time) {
    lines.push(`Courier pick-up: ${[d.date, d.time].filter(Boolean).join(' ')}`);
  }
  return lines.join('\n');
}

/** Shown wherever a member picks or reviews delivery. */
export const DELIVERY_CHARGE_NOTICE =
  'The courier fee is paid by you directly to the courier and is not part of your order total. If you have any questions about your delivery, please contact our team.';
