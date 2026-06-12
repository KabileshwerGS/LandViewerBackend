import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import dns from 'dns';
import { MongoClient } from 'mongodb';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Override Node's default DNS servers to Google's public DNS
// This resolves potential ECONNREFUSED/querySrv errors on Windows hosts
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

let dbClient = null;
let database = null;

async function connectToDatabase() {
  if (database) return database;
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not defined');
  }
  try {
    console.log('Connecting to MongoDB Atlas...');
    dbClient = new MongoClient(MONGODB_URI);
    await dbClient.connect();
    console.log('Successfully connected to MongoDB Atlas');
    database = dbClient.db('test');
    return database;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    dbClient = null;
    database = null;
    throw error;
  }
}

// Endpoint to check database connection status
app.get('/api/status', async (req, res) => {
  try {
    const db = await connectToDatabase();
    await db.command({ ping: 1 });
    res.json({ status: 'connected', database: 'test' });
  } catch (err) {
    res.status(500).json({ status: 'disconnected', error: err.message });
  }
});

// Endpoint to get all leads
app.get('/api/leads', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const collection = db.collection('leads');
    // Fetch all leads sorted by newest first
    const leads = await collection.find({}).sort({ createdAt: -1 }).toArray();
    res.json(leads);
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Failed to fetch leads from database' });
  }
});

// Endpoint to get dashboard stats
app.get('/api/stats', async (req, res) => {
  try {
    const db = await connectToDatabase();
    const collection = db.collection('leads');
    const leads = await collection.find({}).toArray();

    const totalLeads = leads.length;
    
    // Group by lead type
    const typeCounts = {};
    // Group by creation date
    const dateCounts = {};
    
    let latestLead = null;

    leads.forEach(lead => {
      // Lead Type (e.g. visit, query, general)
      const type = lead.type || 'general';
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      // Grouping by Date (YYYY-MM-DD)
      if (lead.createdAt) {
        try {
          const dateStr = new Date(lead.createdAt).toISOString().split('T')[0];
          dateCounts[dateStr] = (dateCounts[dateStr] || 0) + 1;
        } catch (e) {
          // ignore invalid dates
        }
      }

      // Track latest lead
      if (lead.createdAt) {
        if (!latestLead || new Date(lead.createdAt) > new Date(latestLead.createdAt)) {
          latestLead = lead;
        }
      }
    });

    res.json({
      totalLeads,
      typeCounts,
      dateCounts,
      latestLead: latestLead ? { name: latestLead.name, createdAt: latestLead.createdAt } : null
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Serve index.html for all other routes (SPA routing support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server is running on port ${PORT}`);
  try {
    await connectToDatabase();
  } catch (err) {
    console.warn('Warning: Initial MongoDB connection failed. Server will retry connecting upon incoming requests.');
  }
});
