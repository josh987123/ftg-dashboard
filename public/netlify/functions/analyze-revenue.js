const https = require('https');

exports.handler = async function(event, context) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { statementData, periodInfo } = JSON.parse(event.body);

    if (!statementData) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing statement data' })
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Anthropic API key not configured' })
      };
    }

    const systemPrompt = `You are a CFO analyzing a construction company's Revenue.

You must respond with ONLY a valid JSON object containing exactly these 4 arrays:
{
  "key_observations": ["observation 1", "observation 2", "observation 3"],
  "positive_indicators": ["indicator 1", "indicator 2", "indicator 3"],
  "areas_of_concern": ["concern 1", "concern 2", "concern 3"],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

STRICT RULES:
- Return ONLY the JSON object, no other text before or after
- Each array must have exactly 3-4 items
- Each item is one concise sentence with specific dollar amounts
- Round all dollar amounts to whole numbers (no decimals) - use $3.8M not $3.84M
- DO NOT add any other fields or sections`;

    const userPrompt = `Analyze this Revenue data for FTG Builders:

Period: ${periodInfo}

${statementData}`;

    // Using Claude Sonnet 4 - the latest model
    const requestBody = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    const response = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error('Failed to parse Anthropic response'));
          }
        });
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    if (response.statusCode !== 200) {
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: response.body.error?.message || 'Anthropic API error' })
      };
    }

    const rawContent = response.body.content[0].text;
    let analysis;
    
    // Parse the JSON response
    try {
      const result = JSON.parse(rawContent);
      // Convert JSON to markdown format
      analysis = "## Key Observations\n";
      for (const item of (result.key_observations || []).slice(0, 4)) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Positive Indicators\n";
      for (const item of (result.positive_indicators || []).slice(0, 4)) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Areas of Concern\n";
      for (const item of (result.areas_of_concern || []).slice(0, 4)) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Recommendations\n";
      for (const item of (result.recommendations || []).slice(0, 4)) {
        analysis += `- ${item}\n`;
      }
    } catch (parseErr) {
      return {
        statusCode: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Failed to parse AI response' })
      };
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, analysis })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};
