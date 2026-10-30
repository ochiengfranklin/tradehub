import Decimal from 'decimal.js';

/**
 * Money / quantity / price math. THE ONLY place financial numbers are created.
 *
 * Rules
 *  - Never use JS `number` for money. `money()` rejects numbers on purpose.
 *  - Values travel as decimal STRINGS (JSON, DB, exchange API) and become Decimals for math.
 *  - Rounding is always explicit (see roundToStep).
 */

// A private Decimal "clone" so our settings can't leak into (or be changed by) other code.
const D = Decimal.clone({
    precision: 40,
    rounding: Decimal.ROUND_HALF_EVEN,
    // Never switch to exponent notation like "1e-8" when printing.
    toExpNeg: -1000,
    toExpPos: 1000,
});

export type Money = Decimal;
export type RoundingMode = 'DOWN' | 'UP' | 'HALF_EVEN';

const ROUNDING = {
    DOWN: D.ROUND_DOWN,
    UP: D.ROUND_UP,
    HALF_EVEN: D.ROUND_HALF_EVEN,
} as const;

// Plain decimal notation only, as exchanges send it (no exponents, no thousands separators).
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

// Our DB columns are NUMERIC(36,18).
const DB_SCALE = 18;

export function money(value: string | Money): Money {
    if (typeof value === 'string') {
        if (!DECIMAL_PATTERN.test(value)) {
            throw new TypeError(`Invalid decimal string: "${value}"`);
        }
        return new D(value);
    }
    if (D.isDecimal(value)) {
        return new D(value);
    }
    // Reachable only from untyped JS callers; the compiler already blocks numbers.
    throw new TypeError('money() accepts only decimal strings or Decimal values, never JS numbers');
}

export const ZERO: Money = money('0');

/**
 * Serialize for the database / JSON. Throws instead of silently rounding
 * if the value has more decimals than the column can hold.
 */
export function toDbString(value: Money): string {
    if (value.decimalPlaces() > DB_SCALE) {
        throw new RangeError(`Value has more than ${DB_SCALE} decimal places: ${value.toFixed()}`);
    }
    return value.toFixed();
}

/** Round to a multiple of `step` (for example an exchange's quantity step size). */
export function roundToStep(value: Money, step: Money, mode: RoundingMode): Money {
    if (step.lte(0)) {
        throw new RangeError('step must be positive');
    }
    return value.div(step).toDecimalPlaces(0, ROUNDING[mode]).mul(step);
}

export function isMultipleOf(value: Money, step: Money): boolean {
    if (step.lte(0)) {
        throw new RangeError('step must be positive');
    }
    return value.mod(step).isZero();
}