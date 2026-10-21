/**
 * Reads one row of a SalesPlay Back Office customer export.
 *
 * Column names vary between SalesPlay versions and with how the file was
 * saved, so each field accepts several headers (already normalized to
 * lower_snake_case by the import parser).
 */

const ID_COLUMNS = [
  'customer_id',
  'salesplay_customer_id',
  'customer_uid',
  'id',
];
const CODE_COLUMNS = ['customer_code', 'code'];
const PHONE_COLUMNS = [
  'phone_e164',
  'phone',
  'phone_number',
  'phone_no',
  'mobile',
  'mobile_number',
  'mobile_no',
  'customer_mobile',
  'contact',
  'contact_number',
  'contact_no',
  'telephone',
  'tel',
];
const NAME_COLUMNS = ['customer_name', 'name', 'full_name', 'display_name'];
const EMAIL_COLUMNS = ['email', 'email_address', 'customer_email', 'e_mail'];

export type SalesplayCustomerRow = {
  /** The id SalesPlay puts on receipts: Customer ID, else Customer Code. */
  salesplayId: string | null;
  /** Which column `salesplayId` came from, so the preview can say so. */
  idSource: 'customer_id' | 'customer_code' | null;
  phoneRaw: string;
  displayName: string | null;
  email: string | null;
};

function pick(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = String(row[k] ?? '').trim();
    if (v) return v;
  }
  return '';
}

export function readSalesplayCustomerRow(
  row: Record<string, string>,
): SalesplayCustomerRow {
  const id = pick(row, ID_COLUMNS);
  const code = pick(row, CODE_COLUMNS);
  const first = pick(row, ['first_name', 'firstname']);
  const last = pick(row, ['last_name', 'lastname', 'surname']);
  const name = pick(row, NAME_COLUMNS) || [first, last].filter(Boolean).join(' ');
  const email = pick(row, EMAIL_COLUMNS);
  return {
    salesplayId: id || code || null,
    idSource: id ? 'customer_id' : code ? 'customer_code' : null,
    // Our own pushes use the phone digits as the customer code, so a code
    // that looks like a phone number still identifies the member.
    phoneRaw: pick(row, PHONE_COLUMNS) || (/^\+?\d{9,15}$/.test(code) ? code : ''),
    displayName: name || null,
    email: email && email.includes('@') ? email.toLowerCase() : null,
  };
}
