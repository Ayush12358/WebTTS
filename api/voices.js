export default async function handler(req, res) {
  const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
        'Origin': 'https://edge.microsoft.com',
        'Referer': 'https://edge.microsoft.com'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch voices');
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).send(error.message);
  }
}
