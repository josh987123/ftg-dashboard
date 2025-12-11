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

    const systemPrompt = `You are a CFO analyzing a construction company's Income Statement. Provide insightful analysis with specific dollar amounts. Each bullet should be one concise sentence.`;

    const userPrompt = `Analyze this Income Statement for FTG Builders:

Period: ${periodInfo}

${statementData}`;

    const requestBody = JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2048,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "income_statement_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              key_observations: {
                type: "array",
                items: { type: "string" },
                description: "3-4 key observations about the financial data"
              },
              positive_indicators: {
                type: "array",
                items: { type: "string" },
                description: "3-4 positive financial indicators"
              },
              areas_of_concern: {
                type: "array",
                items: { type: "string" },
                description: "3-4 areas requiring attention"
              },
              recommendations: {
                type: "array",
                items: { type: "string" },
                description: "3-4 actionable recommendations"
              }
            },
            required: ["key_observations", "positive_indicators", "areas_of_concern", "recommendations"],
            additionalProperties: false
          }
        }
      }
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

    const rawContent = response.body.choices[0].message.content;
    let analysis;
    
    // Try to parse as JSON first
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
    } catch (e) {
      // Fallback: extract only the 4 sections from text response
      const sections = {
        key_observations: [],
        positive_indicators: [],
        areas_of_concern: [],
        recommendations: []
      };
      
      const headerMap = {
        'key observations': 'key_observations',
        'positive indicators': 'positive_indicators',
        'areas of concern': 'areas_of_concern',
        'recommendations': 'recommendations'
      };
      
      let currentSection = null;
      for (const line of rawContent.split('\n')) {
        const trimmed = line.trim();
        const lowerLine = trimmed.toLowerCase().replace(/#/g, '').trim();
        
        for (const [header, key] of Object.entries(headerMap)) {
          if (lowerLine.includes(header)) {
            currentSection = key;
            break;
          }
        }
        
        if (currentSection && trimmed.startsWith('-')) {
          const bullet = trimmed.slice(1).trim();
          if (bullet && sections[currentSection].length < 4) {
            sections[currentSection].push(bullet);
          }
        }
      }
      
      analysis = "## Key Observations\n";
      for (const item of sections.key_observations) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Positive Indicators\n";
      for (const item of sections.positive_indicators) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Areas of Concern\n";
      for (const item of sections.areas_of_concern) {
        analysis += `- ${item}\n`;
      }
      analysis += "\n## Recommendations\n";
      for (const item of sections.recommendations) {
        analysis += `- ${item}\n`;
      }
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
