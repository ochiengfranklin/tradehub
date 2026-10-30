import { describe, expect, it } from 'vitest';
import { isMultipleOf, money, roundToStep, toDbString } from './money';

describe('money()', () => {
    it('shows why we do not use JS numbers', () => {
        expect(0.1 + 0.2).not.toBe(0.3); // the bug we are avoiding
        expect(money('0.1').plus(money('0.2')).eq(money('0.3'))).toBe(true);
    });

    it('rejects JS numbers at runtime', () => {
        expect(() => money(0.1 as unknown as string)).toThrow(TypeError);
    });

    it.each(['abc', '', '1,000', '1e-8', ' 1', '1.', '.5'])('rejects invalid string %j', (bad) => {
        expect(() => money(bad)).toThrow(TypeError);
    });

    it('accepts Decimal values', () => {
        expect(money(money('1.5')).toFixed()).toBe('1.5');
    });
});

describe('formatting', () => {
    it('never prints exponent notation for tiny values', () => {
        expect(toDbString(money('0.00000001'))).toBe('0.00000001');
        expect(money('0.00000001').mul(money('0.1')).toString()).toBe('0.000000001');
    });

    it('refuses to silently round beyond the database scale', () => {
        expect(() => toDbString(money('0.0000000000000000001'))).toThrow(RangeError);
    });
});

describe('roundToStep()', () => {
    const step = money('0.001');
    const value = money('1.23456789');

    it('rounds down', () => {
        expect(roundToStep(value, step, 'DOWN').toString()).toBe('1.234');
    });
    it('rounds up', () => {
        expect(roundToStep(value, step, 'UP').toString()).toBe('1.235');
    });
    it('rounds half-even', () => {
        expect(roundToStep(value, step, 'HALF_EVEN').toString()).toBe('1.235');
    });
    it('rejects non-positive steps', () => {
        expect(() => roundToStep(value, money('0'), 'DOWN')).toThrow(RangeError);
    });
});

describe('isMultipleOf()', () => {
    it('handles values that break in floating point', () => {
        expect(isMultipleOf(money('0.30'), money('0.10'))).toBe(true);
        expect(isMultipleOf(money('0.35'), money('0.10'))).toBe(false);
    });
    it('rejects non-positive steps', () => {
        expect(() => isMultipleOf(money('1'), money('-1'))).toThrow(RangeError);
    });
});