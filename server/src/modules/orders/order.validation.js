import mongoose from 'mongoose';
import { HttpError } from '../../lib/httpError.js';
import {
  CURRENCY_FORMAT,
  DEFAULT_CURRENCY,
  DESCRIPTION_MAX_LENGTH,
  ORDER_STATUSES,
  TOTAL_AMOUNT_MAX,
} from './order.model.js';

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

function invalid(message) {
  return new HttpError(400, 'VALIDATION_FAILED', message);
}

// How many decimal places the currency allows: 2 for INR, 0 for JPY, 3 for KWD.
function decimalPlaces(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}

function readCurrency(value) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return DEFAULT_CURRENCY;
  }

  const currency = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!CURRENCY_FORMAT.test(currency) || !KNOWN_CURRENCIES.has(currency)) {
    throw invalid('Currency must be a three-letter currency code, such as INR');
  }
  return currency;
}

function readTotalAmount(value, currency) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > TOTAL_AMOUNT_MAX) {
    throw invalid(`Total amount must be a number from 0 to ${TOTAL_AMOUNT_MAX}`);
  }

  const places = decimalPlaces(currency);
  if (Math.round(value * 10 ** places) / 10 ** places !== value) {
    throw invalid(`Total amount can have at most ${places} decimal places in ${currency}`);
  }
  return value;
}

// Body: { customerId: string, description: string, status: string, totalAmount: number,
// currency?: string }. Other fields are ignored, including any organizationId: the
// organization always comes from the route, checked against the caller's membership. Whether
// the customer belongs to that organization is checked by createOrder, not here.
export function validateNewOrder(body) {
  const { customerId } = body ?? {};
  if (customerId === undefined || customerId === null || customerId === '') {
    throw invalid('Customer is required');
  }
  if (typeof customerId !== 'string' || !mongoose.isObjectIdOrHexString(customerId)) {
    throw invalid('Customer ID is not valid');
  }

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length === 0 || description.length > DESCRIPTION_MAX_LENGTH) {
    throw invalid(`Description must be between 1 and ${DESCRIPTION_MAX_LENGTH} characters`);
  }

  if (!ORDER_STATUSES.includes(body.status)) {
    throw invalid(`Status must be one of ${ORDER_STATUSES.join(', ')}`);
  }

  const currency = readCurrency(body.currency);
  const totalAmount = readTotalAmount(body.totalAmount, currency);

  return { customerId, description, status: body.status, totalAmount, currency };
}
