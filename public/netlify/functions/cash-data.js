const { google } = require('googleapis');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1Nkcn2Obvipqn30b-QEfKud0d8G9WTuWicUX07b76wXY';

    if (!serviceAccountEmail || !privateKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Google Sheets credentials not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY environment variables.' 
        })
      };
    }

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey.replace(/\\n/gm, "\n"),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const accountsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Accounts',
    });

    const txnResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Transactions',
    });

    const accountsData = accountsResponse.data.values || [];
    const txnData = txnResponse.data.values || [];

    const accounts = [];
    if (accountsData.length > 1) {
      for (let i = 1; i < accountsData.length; i++) {
        const row = accountsData[i];
        if (row.length >= 2) {
          const name = row[0] || '';
          const balanceStr = row[1] || '0';
          const lastUpdate = row[3] || '';

          let balance = 0;
          try {
            balance = parseFloat(balanceStr.replace(/[$,]/g, ''));
          } catch (e) {
            balance = 0;
          }

          if (name) {
            accounts.push({
              name: name,
              balance: balance,
              lastUpdate: lastUpdate
            });
          }
        }
      }
    }

    const transactions = [];
    if (txnData.length > 1) {
      for (let i = 1; i < txnData.length; i++) {
        const row = txnData[i];
        if (row.length >= 3) {
          const dateStr = row[0] || '';
          const account = row[1] || '';
          const amountStr = row[2] || '0';

          let amount = 0;
          try {
            amount = parseFloat(amountStr.replace(/[$,]/g, ''));
          } catch (e) {
            amount = 0;
          }

          if (dateStr && account) {
            transactions.push({
              date: dateStr,
              account: account,
              amount: amount
            });
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        accounts: accounts,
        transactions: transactions
      })
    };

  } catch (error) {
    console.error('Cash data error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Failed to fetch cash data' })
    };
  }
};
