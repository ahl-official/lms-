const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./lms_database.db');

const roles = [
  'CRM (AHL) - Mumbai',
  'CRM (Alchemane)',
  'CRM (AHL) - Delhi/Bangalore',
  'Process Co-ordinator',
  'Video Editor Intern',
  'Video Editor Junior',
  'Hair Stylist (Intern)',
  'Hair Stylist Level 1',
  'Hair Stylist Level 2',
  'Hair Extension Consultant',
  'Hair Extension Technician Level 1 & Level 2',
  'AI Intern',
  'Graphic Designer',
  'AHL Technician (Intern)',
  'AHL Technician (Junior)',
  'AHL Technician (Senior)',
  'EA (Executive Assistance)',
  'MIS Executive',
  'HR Junior',
  'HR Senior',
  'Inventory Senior',
  'Inventory Junior',
  'Accounts Senior',
  'Accounts Junior',
  'Sales Consultant AHL',
  'Sales Consultant Hair Extensions',
  'Sales Consultant Salon',
  'Influencer Marketing',
  'Digital Marketing Intern',
  'Digital Marketing Junior',
  'Digital Marketing Senior',
  'Cosmetologist',
  'Skin therapist',
  'Inventory (In Center)',
  'Content Strategist Junior',
  'Phone Videography / Content Creator',
  'Operation Manager (Salon)',
  'CRM (Post Sales) SC AHL',
  'CRM (Post Sales) SC Alchemane',
  'Auditor',
  'SMP Technician',
  'Microblading Technician',
  'House Keeping',
  'Training Co-ordinator'
];

// Add existing roles first
const existingRoles = ['admin', 'trainer', 'student'];
const allRoles = [...existingRoles, ...roles];

db.serialize(() => {
  const stmt = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
  
  allRoles.forEach((role, index) => {
    stmt.run(role, (err) => {
      if (err) {
        console.error(`Error inserting role "${role}":`, err);
      } else {
        console.log(`Inserted role: ${role}`);
      }
    });
  });
  
  stmt.finalize(() => {
    console.log('\nAll roles have been processed.');
    
    // Verify the insertion
    db.all('SELECT * FROM roles ORDER BY id', (err, rows) => {
      if (err) {
        console.error('Error fetching roles:', err);
      } else {
        console.log(`\nTotal roles in database: ${rows.length}`);
        rows.forEach(row => {
          console.log(`${row.id}: ${row.name}`);
        });
      }
      db.close();
    });
  });
});