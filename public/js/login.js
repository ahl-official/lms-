document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('error-message');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email')?.value || '';
    const password = document.getElementById('password')?.value || '';

    // Basic validation
    if (!email || !password) {
      errorDiv.textContent = 'Please enter email and password.';
      errorDiv.style.display = 'block';
      return;
    }

    errorDiv.style.display = 'none';

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Explicitly include cookies even if future deployments are cross-origin
        credentials: 'same-origin',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store user data for Sales Trainer frontend compatibility
        sessionStorage.setItem('ahl_user', JSON.stringify(data.user));

        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
        } else {
          switch (data.user.role) {
            case 'admin':
              window.location.href = '/admin/dashboard.html';
              break;
            case 'trainer':
              window.location.href = '/trainer/dashboard.html';
              break;
            case 'student':
              window.location.href = '/student/dashboard.html';
              break;
            default:
              errorDiv.textContent = 'Unknown user role';
              errorDiv.style.display = 'block';
          }
        }
      } else {
        errorDiv.textContent = data.error || 'Invalid credentials';
        errorDiv.style.display = 'block';
      }
    } catch (err) {
      errorDiv.textContent = 'Network error. Please try again.';
      errorDiv.style.display = 'block';
    }
  });
});

