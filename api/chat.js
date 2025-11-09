// api/chat.js - Vercel Serverless Function

export default async function handler(req, res) {
  // CORS headers pour permettre les requêtes depuis Janitor AI
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { model, messages, temperature = 0.7, max_tokens = 1024, stream = false } = req.body;

    // Récupérer la clé API NVIDIA depuis les variables d'environnement
    const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
    
    if (!NVIDIA_API_KEY) {
      return res.status(500).json({ 
        error: 'NVIDIA API key not configured' 
      });
    }

    // Mapper le modèle OpenAI vers un modèle NVIDIA NIM
    const modelMapping = {
      'gpt-3.5-turbo': 'meta/llama-3.1-8b-instruct',
      'gpt-4': 'meta/llama-3.1-70b-instruct',
      'gpt-4-turbo': 'meta/llama-3.1-405b-instruct',
      'gpt-4o': 'deepseek-ai/deepseek-v3.1-terminus',
    };

    const nvidiaModel = modelMapping[model] || 'deepseek-ai/deepseek-v3.1-terminus';

    // Préparer la requête pour NVIDIA NIM
    const nvidiaPayload = {
      model: nvidiaModel,
      messages: messages,
      temperature: temperature,
      max_tokens: max_tokens,
      stream: stream
    };

    // Appeler l'API NVIDIA NIM
    const nvidiaResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nvidiaPayload)
    });

    if (!nvidiaResponse.ok) {
      const errorData = await nvidiaResponse.text();
      console.error('NVIDIA API error:', errorData);
      return res.status(nvidiaResponse.status).json({ 
        error: 'NVIDIA API request failed',
        details: errorData
      });
    }

    // Si streaming, transmettre directement le flux
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = nvidiaResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        res.write(chunk);
      }
      
      return res.end();
    }

    // Si pas de streaming, retourner la réponse complète
    const data = await nvidiaResponse.json();
    
    // Formater la réponse au format OpenAI
    const openaiResponse = {
      id: data.id || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: data.created || Math.floor(Date.now() / 1000),
      model: model,
      choices: data.choices || [],
      usage: data.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };

    return res.status(200).json(openaiResponse);

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
