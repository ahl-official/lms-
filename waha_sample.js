// Configuration - UPDATED TO MATCH WORKING WAHA
const WAHA_BASE_URL = 'https://waha.amankhan.space';  // Fixed URL
const WAHA_API_KEY = 'Americanhairline@123';          // Added API Key
const SESSION_NAME = 'aman';  // Correct session
const SHEET_NAME = 'Sheet1';

// Google Docs IDs for messages
const MESSAGE_DOCS = {
  salon_day0: '1QI_95T2plyC_VVapPI9oERU2gZ87EP1MFmMAj8cMSN8',
  backoffice_day0: '1U57sobu7IycLgYrK8JFUUJ-JQ0NJW5NFIH6uYtjZcJA',
  day30: '1sJBXFhTK1JA-WB6q0S8spyC-UTeoYVLDjzecRnsrIvs',
  day60: '1wgzzVRhkve3HAHTEQ0RHPGN6gQr8UQvRJ0C1UZjfZ2A',
  day90: '14vZJuCpibGBAWEEfWzGoOf3NOlSu0YEuobKg2C3qF1A'
};

// Column indices (0-based)
const COLUMNS = {
  NAME: 0,
  PHONE: 1,
  JOIN_DATE: 2,
  LAST_SENT: 3,
  SENT_MESSAGE: 4,
  MESSAGE0: 5,
  MESSAGE1: 6,
  MESSAGE2: 7,
  MESSAGE3: 8,
  STATUS: 9,
  TYPE: 10
};

/**
 * Main function to check and send messages
 */
function checkAndSendMessages() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      console.error(`Sheet "${SHEET_NAME}" not found`);
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    console.log(`Processing ${data.length - 1} rows of data`);
    
    // Skip header row
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      // Skip empty rows
      if (!row[COLUMNS.NAME] || !row[COLUMNS.PHONE] || !row[COLUMNS.JOIN_DATE]) {
        continue;
      }
      
      const name = row[COLUMNS.NAME];
      const phone = formatPhoneNumber(row[COLUMNS.PHONE]);
      const joinDate = new Date(row[COLUMNS.JOIN_DATE]);
      const sentMessage = row[COLUMNS.SENT_MESSAGE] || '';
      const type = row[COLUMNS.TYPE] || 'Salon';
      
      const today = new Date();
      const daysSinceJoin = Math.floor((today - joinDate) / (1000 * 60 * 60 * 24));
      
      console.log(`Processing ${name}: Days since join = ${daysSinceJoin}, Last sent = ${sentMessage}`);
      
      let messageToSend = null;
      let columnToUpdate = null;
      let messageDay = null;
      
      // Determine which message to send
      if (daysSinceJoin >= 0 && !sentMessage.includes('day0')) {
        const messageType = type.toLowerCase() === 'salon' ? 'salon_day0' : 'backoffice_day0';
        messageToSend = getMessageFromDoc(MESSAGE_DOCS[messageType]);
        columnToUpdate = COLUMNS.MESSAGE0;
        messageDay = 'day0';
      } else if (daysSinceJoin >= 30 && !sentMessage.includes('day30')) {
        messageToSend = getMessageFromDoc(MESSAGE_DOCS.day30);
        columnToUpdate = COLUMNS.MESSAGE1;
        messageDay = 'day30';
      } else if (daysSinceJoin >= 60 && !sentMessage.includes('day60')) {
        messageToSend = getMessageFromDoc(MESSAGE_DOCS.day60);
        columnToUpdate = COLUMNS.MESSAGE2;
        messageDay = 'day60';
      } else if (daysSinceJoin >= 90 && !sentMessage.includes('day90')) {
        messageToSend = getMessageFromDoc(MESSAGE_DOCS.day90);
        columnToUpdate = COLUMNS.MESSAGE3;
        messageDay = 'day90';
      }
      
      // Send message if needed
      if (messageToSend && columnToUpdate !== null && messageDay) {
        const success = sendWhatsAppMessage(phone, messageToSend, name);
        
        if (success) {
          // Update the sheet
          sheet.getRange(i + 1, columnToUpdate + 1).setValue('Sent');
          sheet.getRange(i + 1, COLUMNS.LAST_SENT + 1).setValue(new Date());
          sheet.getRange(i + 1, COLUMNS.STATUS + 1).setValue('Active');
          updateSentMessage(sheet, i + 1, messageDay);
          
          console.log(`${messageDay} message sent successfully to ${name} (${phone})`);
          Utilities.sleep(2000);
        } else {
          console.error(`Failed to send ${messageDay} message to ${name} (${phone})`);
        }
      }
    }
  } catch (error) {
    console.error('Error in checkAndSendMessages:', error.toString());
  }
}

/**
 * FIXED: Send WhatsApp message via WAHA API - Updated to match working version
 */
function sendWhatsAppMessage(phone, message, name) {
  try {
    console.log('=== SENDING WHATSAPP MESSAGE VIA UPDATED WAHA ===');
    
    // Test connection first
    const connectionTest = testWAHAConnection();
    if (!connectionTest.success) {
      console.error('WAHA connection failed:', connectionTest.error);
      return false;
    }

    const personalizedMessage = message.replace(/\{name\}/g, name);
    
    // Format phone number to match working format
    let formattedPhone = phone.toString().replace(/\D/g, '');
    if (!formattedPhone.startsWith('91')) {
      formattedPhone = '91' + formattedPhone;
    }
    
    // Updated payload to match working version
    const payload = {
      session: SESSION_NAME,
      chatId: formattedPhone + '@c.us',
      text: personalizedMessage
    };
    
    // Updated options to match working version with API key
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': WAHA_API_KEY  // Added API key header
      },
      payload: JSON.stringify(payload)
    };
    
    console.log(`Sending to: ${formattedPhone}@c.us using session: ${SESSION_NAME}`);
    
    // Updated endpoint to match working version
    const response = UrlFetchApp.fetch(WAHA_BASE_URL + '/api/sendText', options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    console.log(`WAHA API Response: ${responseCode}`);
    console.log(`Response body: ${responseText}`);
    
    if (responseCode === 200 || responseCode === 201) {
      console.log('✅ Message sent successfully');
      return true;
    } else {
      console.error(`❌ WAHA API error: ${responseCode} - ${responseText}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error sending WhatsApp message:`, error.toString());
    return false;
  }
}

/**
 * FIXED: Test WAHA connection - Updated to match working version
 */
function testWAHAConnection() {
  try {
    const healthOptions = {
      method: 'GET',
      headers: { 'X-Api-Key': WAHA_API_KEY }  // Added API key header
    };
    
    const healthResponse = UrlFetchApp.fetch(WAHA_BASE_URL + '/api/sessions', healthOptions);
    
    if (healthResponse.getResponseCode() !== 200) {
      return { success: false, error: `Server returned status ${healthResponse.getResponseCode()}` };
    }
    
    const sessions = JSON.parse(healthResponse.getContentText());
    const ourSession = sessions.find(s => s.name === SESSION_NAME);
    
    if (!ourSession || ourSession.status !== 'WORKING') {
      return { success: false, error: `Session ${SESSION_NAME} not working` };
    }
    
    console.log('✅ WAHA connection successful, session working');
    return { success: true };
    
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

/**
 * Get message content from Google Doc
 */
function getMessageFromDoc(docId) {
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const text = body.getText();
    console.log(`Retrieved message from doc ${docId}: ${text.substring(0, 50)}...`);
    return text;
  } catch (error) {
    console.error(`Error reading document ${docId}: ${error.toString()}`);
    return `Error loading message content. Please check document permissions.`;
  }
}

/**
 * Update the Sent Message column
 */
function updateSentMessage(sheet, rowIndex, messageDay) {
  const currentValue = sheet.getRange(rowIndex, COLUMNS.SENT_MESSAGE + 1).getValue() || '';
  const newValue = currentValue ? `${currentValue}, ${messageDay}` : messageDay;
  sheet.getRange(rowIndex, COLUMNS.SENT_MESSAGE + 1).setValue(newValue);
}

/**
 * FIXED: Format phone number for WhatsApp - Updated to match working version
 */
function formatPhoneNumber(phone) {
  let cleanPhone = phone.toString().replace(/\D/g, '');
  
  // Ensure Indian number format
  if (cleanPhone.length === 10) {
    cleanPhone = '91' + cleanPhone;
  }
  
  return cleanPhone;
}

/**
 * Handle sheet edits - THIS FUNCTION WILL BE CALLED BY MANUAL TRIGGER
 */
function onSheetEdit(e) {
  try {
    console.log('Sheet edit detected');
    if (e && e.source && e.source.getActiveSheet().getName() !== SHEET_NAME) {
      return;
    }
    
    console.log('Edit in target sheet, checking for messages...');
    Utilities.sleep(3000);
    checkAndSendMessages();
  } catch (error) {
    console.error('Error in onSheetEdit:', error.toString());
    // If event object is not available, just run the check
    checkAndSendMessages();
  }
}

/**
 * Manual check function
 */
function runManualCheck() {
  console.log('Running manual check...');
  checkAndSendMessages();
}

/**
 * UPDATED: Test single message with new WAHA implementation
 */
function testSingleMessage() {
  const testPhone = '917021247525'; // Replace with your test number
  const testName = 'Test User';
  const testMessage = 'Hello {name}, this is a test message from HR Policy Bot using updated WAHA v3.0!';
  
  console.log('Testing single message with updated WAHA...');
  const success = sendWhatsAppMessage(testPhone, testMessage, testName);
  console.log('Test message result:', success);
  return success;
}

/**
 * Process today's entries only
 */
function processNewEntriesToday() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const data = sheet.getDataRange().getValues();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log('Processing new entries for today...');
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (!row[COLUMNS.NAME] || !row[COLUMNS.PHONE] || !row[COLUMNS.JOIN_DATE]) {
        continue;
      }
      
      const joinDate = new Date(row[COLUMNS.JOIN_DATE]);
      joinDate.setHours(0, 0, 0, 0);
      
      if (joinDate.getTime() === today.getTime()) {
        const name = row[COLUMNS.NAME];
        const phone = formatPhoneNumber(row[COLUMNS.PHONE]);
        const sentMessage = row[COLUMNS.SENT_MESSAGE] || '';
        const type = row[COLUMNS.TYPE] || 'Salon';
        
        if (!sentMessage.includes('day0')) {
          const messageType = type.toLowerCase() === 'salon' ? 'salon_day0' : 'backoffice_day0';
          const messageToSend = getMessageFromDoc(MESSAGE_DOCS[messageType]);
          
          const success = sendWhatsAppMessage(phone, messageToSend, name);
          
          if (success) {
            sheet.getRange(i + 1, COLUMNS.MESSAGE0 + 1).setValue('Sent');
            sheet.getRange(i + 1, COLUMNS.LAST_SENT + 1).setValue(new Date());
            sheet.getRange(i + 1, COLUMNS.STATUS + 1).setValue('Active');
            updateSentMessage(sheet, i + 1, 'day0');
            
            console.log(`Day 0 message sent to ${name}`);
            Utilities.sleep(2000);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in processNewEntriesToday:', error.toString());
  }
}