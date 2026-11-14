function buildFallbackSuggestion({ description = '', posterImageUrl = '' } = {}) {
  const seed = (description || posterImageUrl || 'student club event').trim();
  const words = seed.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
  const title = words ? words.replace(/[^\w\s-]/g, '') : 'Club Event';
  const date = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);

  return {
    title: title || 'Club Event',
    date,
    location: 'Student Center',
    summary: `${title || 'Club Event'} • ${date} • Student Center`,
  };
}

function parseSuggestionText(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  const titleMatch = text.match(/title\s*[:\-]\s*([^\n]+)$/im) ?? text.match(/"title"\s*:\s*"([^"]+)"/i);
  const dateMatch = text.match(/date\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i) ?? text.match(/"date"\s*:\s*"(\d{4}-\d{2}-\d{2})"/i);
  const locationMatch = text.match(/location\s*[:\-]\s*([^\n]+)$/im) ?? text.match(/"location"\s*:\s*"([^"]+)"/i);

  const title = (titleMatch?.[1] || '').trim();
  const date = (dateMatch?.[1] || '').trim();
  const location = (locationMatch?.[1] || '').trim();

  if (!title || !date || !location) {
    return null;
  }

  return { title, date, location, summary: `${title} • ${date} • ${location}` };
}

async function generateEventSuggestion({ description = '', posterImageUrl = '' } = {}, client = fetch) {
  const fallback = buildFallbackSuggestion({ description, posterImageUrl });
  const prompt = description || posterImageUrl || 'Create a student club event announcement';
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return fallback;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await client(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Return JSON with title, date and location, and nothing else. Event description: ${prompt}`,
                },
              ],
            },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error('Provider request failed');
    }

    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text).join(' ') || '';
    const suggestion = parseSuggestionText(text);
    return suggestion || fallback;
  } catch (error) {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  buildFallbackSuggestion,
  generateEventSuggestion,
  parseSuggestionText,
};
