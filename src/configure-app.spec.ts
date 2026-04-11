import { isOriginAllowed, parseAllowedOrigins } from './configure-app';

describe('configureApp CORS helpers', () => {
  it('parses comma-separated origins and normalizes trailing slashes', () => {
    expect(
      parseAllowedOrigins(
        'https://www.joincalen.com/, https://joincalen.com , http://localhost:5173/',
      ),
    ).toEqual([
      'https://www.joincalen.com',
      'https://joincalen.com',
      'http://localhost:5173',
    ]);
  });

  it('allows normalized production origins', () => {
    const allowedOrigins = parseAllowedOrigins('https://www.joincalen.com/');

    expect(
      isOriginAllowed('https://www.joincalen.com', allowedOrigins),
    ).toBe(true);
  });

  it('rejects origins that are not configured', () => {
    const allowedOrigins = parseAllowedOrigins('https://www.joincalen.com');

    expect(isOriginAllowed('https://app.joincalen.com', allowedOrigins)).toBe(
      false,
    );
  });
});
