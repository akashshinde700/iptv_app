// Deterministic secrets for unit tests.
process.env.PROXY_SIGNING_SECRET ??= 'test-proxy-secret-000000000000000000000000000000'
process.env.PORTAL_ENC_KEY ??= '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
process.env.NODE_ENV ??= 'test'
