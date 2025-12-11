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

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OpenAI API key not configured' })
      };
    }

    const systemPrompt = `You are a seasoned CFO analyzing construction company financials. Provide a brief, focused analysis with exactly these 4 sections:

## Key Observations
- 3-4 bullet points on significant trends or patterns

## Positive Indicators
- 3-4 bullet points on strong performance areas

## Areas of Concern
- 3-4 bullet points on metrics needing attention

## Recommendations
- 3-4 actionable bullet points

Be concise. Use specific numbers. No introductions or conclusions.`;

    const userPrompt = `Please analyze this Income Statement for FTG Builders:

Period: ${periodInfo}

${statementData}

Provide a comprehensive but concise CFO-level analysis.`;

    const requestBody = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2048
    });

    const response = await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error('Failed to parse OpenAI response'));
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
        body: JSON.stringify({ error: response.body.error?.message || 'OpenAI API error' })
      };
    }

    const analysis = response.body.choices[0].message.content;

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, analysis })
    };

  } catch (error) {
    console.error('AI Analysis error:', error);
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
