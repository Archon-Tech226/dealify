// Seed script to create default admin account
const mongoose = require('mongoose');
const dns = require('dns');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Use Google DNS (fixes local DNS issues with MongoDB Atlas)
dns.setServers(['8.8.8.8', '8.8.4.4']);

const User = require('../models/User');
const connectDB = require('../config/db');

const seedAdmin = async () => {
  try {
    await connectDB();

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('⚠️  Admin already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log('   Skipping seed.');
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: 'Dealify Admin',
      email: 'admin@dealify.com',
      phone: '9999999999',
      password: 'admin123456',
      role: 'admin',
      isActive: true,
    });

    console.log('✅ Admin account created successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   Name:     ${admin.name}`);
    console.log(`   Email:    ${admin.email}`);
    console.log(`   Password: admin123456`);
    console.log(`   Role:     ${admin.role}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  Change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed Error:', error.message);
    process.exit(1);
  }
};

seedAdmin();
