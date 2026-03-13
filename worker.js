// worker.js (Cloudflare Worker)
export default {
  async fetch(req, env) {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/api/tts") {
      return new Response("Not found", { status: 404 });
    }

    try {
      const { text, voice = "en-US-JennyNeural", format = "audio-24khz-48kbitrate-mono-mp3" } = await req.json();
      if (!text || !text.trim()) {
        return new Response(JSON.stringify({ error: "No text" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const region = env.AZURE_SPEECH_REGION; // e.g. "eastus" or "canadacentral"
      const key = env.AZURE_SPEECH_KEY;

      // 1) get token
      const tokResp = await fetch(`https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key }
      });
      if (!tokResp.ok) {
        const t = await tokResp.text();
        return new Response(t, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
      }
      const token = await tokResp.text();

      // 2) SSML
      const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${voice}">${escapeXml(text)}</voice></speak>`;

      // 3) synthesize
      const ttsResp = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": format,
          "User-Agent": "sterile-dressing-tts"
        },
        body: ssml
      });

      if (!ttsResp.ok) {
        const m = await ttsResp.text();
        return new Response(m, { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
      }

      return new Response(ttsResp.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (err) {
      return new Response(String(err), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
    }
  }
};

function escapeXml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
          .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
          .replace(/'/g,"&apos;");
}
