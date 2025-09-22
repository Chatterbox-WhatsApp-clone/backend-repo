const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../server');

describe('WhatsApp Clone Backend', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://pricelesswilliams1234:W3n1sb5TpNXBDouT@cluster0.8vsqbw4.mongodb.net/whatsapp-clone-test?retryWrites=true&w=majority&appName=Cluster0');
  });

  afterAll(async () => {
    // Close database connection
    await mongoose.connection.close();
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('OK');
      expect(response.body.message).toBe('WhatsApp Clone Backend is running');
    });
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.token).toBeDefined();
    });

    it('should login existing user', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.token).toBeDefined();
    });
  });
}); 