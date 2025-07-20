import jwt, { JwtPayload } from '@tsndr/cloudflare-worker-jwt';

async function generateToken(address: string, env: Env): Promise<string> {
  const payload = {
    sub: address,
    iat: Math.floor(Date.now() / 1000),
  };

  const token = await jwt.sign(payload, env.JWT_SECRET);
  return token;
}

async function verifyToken(token: string, env: Env): Promise<JwtPayload | undefined> {
  const valid = await jwt.verify(token, env.JWT_SECRET);
  if (!valid) return undefined;

  const { payload } = jwt.decode(token);
  return payload;
}

export { generateToken, verifyToken };
