import { isNonPublicIpAddress, resolveProviderEndpoint } from '../src/server/provider-egress.mjs';

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    if (details) error.details = details;
    throw error;
  }
}

async function assertRejects(promise, expectedCode, message) {
  try {
    await promise;
  } catch (error) {
    assert(error.code === expectedCode, message, { expectedCode, actualCode: error.code });
    return;
  }
  throw new Error(message);
}

const nonPublicAddresses = [
  '0.0.0.0',
  '10.0.0.1',
  '100.64.0.1',
  '127.0.0.1',
  '169.254.1.1',
  '172.16.0.1',
  '192.0.0.1',
  '192.0.2.1',
  '192.168.1.1',
  '198.18.0.1',
  '198.51.100.1',
  '203.0.113.1',
  '224.0.0.1',
  '255.255.255.255',
  '::',
  '::1',
  '::ffff:127.0.0.1',
  '::ffff:7f00:1',
  '64:ff9b::7f00:1',
  '2001:db8::1',
  'fc00::1',
  'fe80::1',
  'ff02::1',
];

const publicAddresses = ['1.1.1.1', '8.8.8.8', '2001:4860:4860::8888', '2606:4700:4700::1111'];

try {
  for (const address of nonPublicAddresses) {
    assert(isNonPublicIpAddress(address), 'Expected a non-public address to be rejected', { address });
  }
  for (const address of publicAddresses) {
    assert(!isNonPublicIpAddress(address), 'Expected a public address to be accepted', { address });
  }

  const loopbackEndpoint = await resolveProviderEndpoint(
    { id: 'local-openai', scope: 'local', baseUrl: 'http://127.0.0.1:1234/v1' },
    'chat/completions',
  );
  assert(
    loopbackEndpoint.href === 'http://127.0.0.1:1234/v1/chat/completions',
    'Local endpoint path was not fixed beneath the configured base path',
    { endpoint: loopbackEndpoint.href },
  );

  await assertRejects(
    resolveProviderEndpoint(
      { id: 'local-openai', scope: 'local', baseUrl: 'http://192.168.1.5:1234/v1' },
      'chat/completions',
    ),
    'LOCAL_PROVIDER_DESTINATION_FORBIDDEN',
    'A non-loopback local provider was accepted',
  );
  await assertRejects(
    resolveProviderEndpoint(
      { id: 'openai', scope: 'hosted', baseUrl: 'https://user:secret@example.com' },
      'v1/responses',
    ),
    'PROVIDER_CONFIGURATION_INVALID',
    'A provider URL containing credentials was accepted',
  );
  await assertRejects(
    resolveProviderEndpoint(
      { id: 'openai', scope: 'hosted', baseUrl: 'https://example.com?destination=internal' },
      'v1/responses',
    ),
    'PROVIDER_CONFIGURATION_INVALID',
    'A provider URL containing a query was accepted',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        nonPublicAddresses: nonPublicAddresses.length,
        publicAddresses: publicAddresses.length,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(JSON.stringify({ ok: false, message: error.message, details: error.details || null }, null, 2));
  process.exitCode = 1;
}
