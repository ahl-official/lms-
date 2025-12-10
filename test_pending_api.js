const axios = require('axios');

async function testPendingAPI() {
    try {
        console.log('Testing AI Content Pending API...');
        
        // Login first
        const loginResponse = await axios.post('http://localhost:3000/api/login', {
            email: 'admin@ahl.com',
            password: 'admin123'
        });
        
        const sessionCookie = loginResponse.headers['set-cookie']?.[0];
        console.log('Login successful');
        
        // Check pending content
        const pendingResponse = await axios.get('http://localhost:3000/api/ai-content/pending', {
            headers: {
                'Cookie': sessionCookie
            }
        });
        
        console.log('Pending content response:', {
            count: pendingResponse.data.length || 0,
            items: pendingResponse.data
        });
        
        if (pendingResponse.data.length > 0) {
            console.log('✅ SUCCESS: Pending content is visible to admin!');
            console.log('Latest pending item:', pendingResponse.data[0]);
        } else {
            console.log('❌ No pending content found');
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testPendingAPI();