const mongoose = require('mongoose');
const dotenv = require('dotenv');
const dns = require('dns');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

dns.setServers(['8.8.8.8', '8.8.4.4']);

const Category = require('../models/Category');
const connectDB = require('../config/db');

const categories = [
  { name: 'Electronics', icon: '📱', description: 'Smartphones, laptops, gadgets & accessories', sortOrder: 1 },
  { name: 'Fashion - Men', icon: '👔', description: 'Men\'s clothing, shoes & accessories', sortOrder: 2 },
  { name: 'Fashion - Women', icon: '👗', description: 'Women\'s clothing, shoes & accessories', sortOrder: 3 },
  { name: 'Home & Kitchen', icon: '🏠', description: 'Furniture, cookware, home decor & appliances', sortOrder: 4 },
  { name: 'Beauty & Health', icon: '💄', description: 'Skincare, makeup, wellness & personal care', sortOrder: 5 },
  { name: 'Sports & Fitness', icon: '⚽', description: 'Equipment, sportswear & fitness accessories', sortOrder: 6 },
  { name: 'Books & Stationery', icon: '📚', description: 'Books, notebooks, pens & office supplies', sortOrder: 7 },
  { name: 'Toys & Games', icon: '🧸', description: 'Kids toys, board games & outdoor play', sortOrder: 8 },
  { name: 'Grocery & Food', icon: '🛒', description: 'Snacks, beverages, staples & gourmet food', sortOrder: 9 },
  { name: 'Baby & Kids', icon: '👶', description: 'Baby care, kids fashion & essentials', sortOrder: 10 },
  { name: 'Mobiles & Tablets', icon: '📲', description: 'Mobile phones, tablets & accessories', sortOrder: 11 },
  { name: 'Jewellery & Watches', icon: '💍', description: 'Artificial & real jewellery, watches', sortOrder: 12 },
];

const seedCategories = async () => {
  try {
    await connectDB();
    console.log('🗑️  Clearing existing categories...');
    await Category.deleteMany({});

    console.log('🌱 Seeding categories...');
    const created = [];
    for (const cat of categories) {
      const c = await Category.create(cat);
      created.push(c);
    }
    console.log(`✅ ${created.length} categories seeded successfully!\n`);

    created.forEach((c) => {
      console.log(`   ${c.icon}  ${c.name} → /category/${c.slug}`);
    });

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
};

seedCategories();
