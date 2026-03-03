const jwt = require('jsonwebtoken');

// Use the same JWT secret as the app (from env)
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-for-development-only';

// Generate a JWT token for our platform admin user
const token = jwt.sign(
  {
    userId: '5e1f4268-5b7c-4f0c-8d69-fa3a07fd8a43',
    firmId: '44daab93-0d11-4028-9ea0-8e781e59045e',
    email: '980vermarajput@gmail.com',
    role: 'member'
  },
  JWT_SECRET,
  { expiresIn: '24h' }
);

console.log('Platform Admin JWT Token:');
console.log(token);
console.log('\n');
console.log('Test commands:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/platform-admin/firms`);
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/platform-admin/usage`);
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/platform-admin/sync-failures`);