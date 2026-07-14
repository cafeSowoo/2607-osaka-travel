import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTimeInput, isValidTime, normalizeTime, parseTimeToMinutes } from '../src/lib/time.ts'

test('normalizes and parses valid 24-hour times', () => {
  assert.equal(normalizeTime(' 09:30:00 '), '09:30')
  assert.equal(parseTimeToMinutes('00:00'), 0)
  assert.equal(parseTimeToMinutes('23:59'), 23 * 60 + 59)
  assert.equal(isValidTime('12:05'), true)
})

test('rejects malformed or out-of-range times', () => {
  assert.equal(parseTimeToMinutes('9:30'), null)
  assert.equal(parseTimeToMinutes('24:00'), null)
  assert.equal(parseTimeToMinutes('12:60'), null)
  assert.equal(isValidTime(''), false)
})

test('formats numeric time input and preserves colon deletion behavior', () => {
  assert.equal(formatTimeInput('1'), '1')
  assert.equal(formatTimeInput('12'), '12:')
  assert.equal(formatTimeInput('1234'), '12:34')
  assert.equal(formatTimeInput('12', '12:'), '1')
})
