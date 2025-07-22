export function preflightResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };
}

export function jsonWithCors(data: unknown, status = 200) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': typeof data === 'string' ? 'text/plain' : 'application/json',
      ...corsHeaders()
    },
  });
}
