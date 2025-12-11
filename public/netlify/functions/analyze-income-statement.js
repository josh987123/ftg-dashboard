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

    const systemPrompt = `You are a seasoned CFO and financial analyst with 20+ years of experience analyzing construction company financials. 

Your task is to analyze the provided Income Statement and deliver insights that would be valuable to company leadership. Focus on:

1. **Key Observations**: Identify the most significant trends, patterns, or anomalies in the data
2. **Profitability Analysis**: Assess gross profit margins, operating margins, and overall profitability
3. **Revenue Trends**: Comment on revenue patterns if multiple periods are shown
4. **Cost Structure**: Analyze the cost of goods sold and operating expenses
5. **Areas of Concern**: Flag any concerning trends or metrics that need attention
6. **Positive Indicators**: Highlight strong performance areas
7. **Recommendations**: Provide 2-3 actionable recommendations based on the data

Keep your analysis concise but insightful. Use specific numbers from the data to support your observations. Format your response with clear headings and bullet points for readability.`;

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
