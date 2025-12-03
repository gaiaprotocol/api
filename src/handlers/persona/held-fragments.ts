import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { fetchHeldPersonaFragmentsForHolder } from '../../db/persona/fragments';

export async function handleHeldPersonaFragments(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors(
        { error: 'Missing or invalid authorization token.' },
        401,
      );
    }

    const token = auth.slice(7);
    let payload: any;

    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors(
        { error: 'Invalid or expired token. Please log in again.' },
        401,
      );
    }

    const holderAddress = payload?.sub as string | undefined;
    if (!holderAddress) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    const holdings = await fetchHeldPersonaFragmentsForHolder(
      env,
      holderAddress,
    );

    // holdings: PersonaFragmentHolding[] (camelCase)
    return jsonWithCors({ holdings });
  } catch (err) {
    console.error('[handleHeldPersonaFragments] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
