export const PICKUP_VENUE_NAME = 'Moja Maison';

export const PICKUP_ADDRESS_LINE =
  '43, Jalan Eko Botani 2F, Taman Eko Botani 2';

export const PICKUP_ADDRESS_FULL = `${PICKUP_VENUE_NAME}, ${PICKUP_ADDRESS_LINE}`;

export const PICKUP_GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${PICKUP_ADDRESS_FULL}, Malaysia`)}`;
