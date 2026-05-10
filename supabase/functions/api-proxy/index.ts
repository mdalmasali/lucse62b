// @ts-ignore: Deno import resolution when Deno extension is not active
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url);
    const actionType = url.searchParams.get('type');

    // GET /?type=sheet&sheetName=... -> Fetch Google Sheet
    if (req.method === 'GET' && actionType === 'sheet') {
      const sheetName = url.searchParams.get('sheetName');
      if (!sheetName) throw new Error('Missing sheetName parameter');
      
      // @ts-ignore: Deno global object
      const customSheetId = url.searchParams.get('customSheetId');
      // @ts-ignore: Deno global object
      const SHEET_ID = customSheetId || Deno.env.get('GOOGLE_SHEET_ID');
      if (!SHEET_ID) throw new Error('Server missing GOOGLE_SHEET_ID configuration');

      const gUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
      const response = await fetch(gUrl);
      const text = await response.text();
      
      // Google Sheet returns JSON wrapped in a function call and some prefix text "/*O_o*/\n"
      // e.g. /*O_o*/\ngoogle.visualization.Query.setResponse({"version":"0.6"...});
      let jsonStr = text;
      const startIndex = text.indexOf('{');
      const endIndex = text.lastIndexOf('}');
      
      if (startIndex >= 0 && endIndex >= 0) {
        jsonStr = text.substring(startIndex, endIndex + 1);
      }
      
      return new Response(jsonStr, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /?type=lu-result -> Proxy LU API
    if (req.method === 'POST' && actionType === 'lu-result') {
      // @ts-ignore: Deno global object
      const LU_API_URL = Deno.env.get('LU_RESULT_API_URL');
      if (!LU_API_URL) throw new Error('Server missing LU_RESULT_API_URL configuration');

      const bodyText = await req.text(); // expects standard x-www-form-urlencoded body from frontend
      
      const response = await fetch(LU_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: bodyText,
      });

      const data = await response.text();
      return new Response(data, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Invalid request type or method');
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Unknown error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
