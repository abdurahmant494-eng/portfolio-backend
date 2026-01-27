// DEBUG: Check environment variables
console.log('=== ENVIRONMENT CHECK ===');
console.log('EMAIL_SERVICE:', process.env.EMAIL_SERVICE || 'NOT SET (defaulting to sendgrid)');
console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET (hidden)' : 'NOT SET');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
console.log('PORT:', process.env.PORT || 10000);
console.log('=========================');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// ========== MIDDLEWARE ==========
app.set('trust proxy', 1); // Fix for rate limiter behind proxy

app.use(cors({
  origin: [
    'https://tahir-abduro.netlify.app',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://localhost:5500'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());

// ========== RATE LIMITING ==========
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many contact form submissions from this IP. Please try again in 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const healthLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Too many health check requests'
  }
});

// ========== EMAIL TRANSPORTER ==========
const createEmailTransporter = () => {
  const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
  
  if (emailService === 'gmail') {
    console.log('📧 Using Gmail SMTP for emails');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  } else {
    console.log('📧 Using SendGrid for emails');
    const sgMail = require('@sendgrid/mail');
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
    return sgMail;
  }
};

// ========== DATABASE CONNECTION ==========
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.WINDOW_LINT;
    if (!mongoURI) {
      console.log('⚠️  No MongoDB URI found in environment variables');
      return;
    }

    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    mongoose.connection.on('connected', () => {
      console.log('🔗 MongoDB connection established');
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('💡 Check:');
    console.log('   1. MONGODB_URI in environment variables');
    console.log('   2. MongoDB Atlas network access (IP whitelist)');
    console.log('   3. Database user permissions');
    console.log('   4. Special characters in password (URL encode @ as %40)');
  }
};

connectDB();

// ========== DATABASE SCHEMA ==========
const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  subject: String,
  message: { type: String, required: true },
  date: { type: Date, default: Date.now },
  ip: String,
  userAgent: String,
  emailSent: { type: Boolean, default: false }
});

const Contact = mongoose.model('Contact', contactSchema);

// ========== EMAIL TEMPLATES ==========
const emailTemplates = {
  adminEmail: (data) => ({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    replyTo: data.email,
    subject: `📧 New Portfolio Message: ${data.subject || 'No Subject'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00eeff;">New Contact Form Submission</h2>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
          <p><strong>Name:</strong> ${data.name}</p>
          <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
          <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
          <p><strong>Subject:</strong> ${data.subject || 'No subject'}</p>
          <p><strong>Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #00eeff;">
            ${data.message.replace(/\n/g, '<br>')}
          </div>
          <p style="margin-top: 15px; font-size: 12px; color: #666;">
            <strong>IP:</strong> ${data.ip}<br>
            <strong>Time:</strong> ${new Date().toLocaleString()}<br>
            <strong>Database ID:</strong> ${data.dbId || 'Not saved'}
          </p>
        </div>
        <p style="margin-top: 20px; color: #666;">
          <a href="https://portfolio-backend-4-79pt.onrender.com/admin/contacts" style="color: #00eeff;">View all messages</a>
        </p>
      </div>
    `
  }),
  
  userEmail: (data) => ({
    from: process.env.EMAIL_USER,
    to: data.email,
    subject: 'Thank you for contacting Tahir Abduro!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #00eeff;">Thank You for Your Message!</h2>
        <p>Dear <strong>${data.name}</strong>,</p>
        <p>I have received your message and will get back to you as soon as possible.</p>
        <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <p><strong>Your Message:</strong></p>
          <div style="background: white; padding: 15px; border-radius: 5px;">
            ${data.message.replace(/\n/g, '<br>')}
          </div>
        </div>
        <p><strong>Best regards,</strong><br>
        <strong>Tahir Abduro</strong><br>
        Frontend Developer & Tech Expert</p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
          <p style="color: #666; font-size: 14px;">
            <strong>My Services:</strong><br>
            • Frontend Web Development<br>
            • Graphics & UI/UX Design<br>
            • YouTube Video Production<br>
            • Photography & Tech Support
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            This is an automated response. Please do not reply to this email.<br>
            For urgent matters, contact me directly through my social media links on my portfolio.
          </p>
        </div>
      </div>
    `
  })
};

// ========== SEND EMAIL FUNCTION ==========
const sendEmails = async (data) => {
  const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
  
  try {
    if (emailService === 'gmail') {
      const transporter = createEmailTransporter();
      
      const adminMail = emailTemplates.adminEmail(data);
      const userMail = emailTemplates.userEmail(data);
      
      const [adminResult, userResult] = await Promise.all([
        transporter.sendMail(adminMail),
        transporter.sendMail(userMail)
      ]);
      
      return {
        success: true,
        adminSent: !!adminResult.messageId,
        userSent: !!userResult.messageId,
        service: 'gmail'
      };
      
    } else {
      const sgMail = createEmailTransporter();
      
      const adminMsg = {
        to: process.env.EMAIL_USER,
        from: process.env.EMAIL_USER,
        replyTo: data.email,
        subject: `📧 New Portfolio Message: ${data.subject || 'No Subject'}`,
        html: emailTemplates.adminEmail(data).html
      };
      
      const userMsg = {
        to: data.email,
        from: process.env.EMAIL_USER,
        subject: 'Thank you for contacting Tahir Abduro!',
        html: emailTemplates.userEmail(data).html
      };
      
      const [adminResult, userResult] = await Promise.all([
        sgMail.send(adminMsg),
        sgMail.send(userMsg)
      ]);
      
      return {
        success: true,
        adminSent: adminResult[0]?.statusCode === 202,
        userSent: userResult[0]?.statusCode === 202,
        service: 'sendgrid'
      };
    }
    
  } catch (error) {
    console.error('❌ Email sending error:', error.message);
    return {
      success: false,
      error: error.message,
      service: emailService
    };
  }
};

// ========== ROUTES ==========

// Health Check Endpoint
app.get('/api/health', healthLimiter, (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
  
  res.json({
    message: 'Server is running!',
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    emailService: emailService,
    frontendDomain: 'https://tahir-abduro.netlify.app',
    uptime: process.uptime()
  });
});

// Contact Form Endpoint
app.post('/api/contact', contactLimiter, async (req, res) => {
  const startTime = Date.now();
  const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  
  console.log('📩 New contact form submission:', {
    name: req.body.name,
    email: req.body.email,
    ip: clientIp,
    timestamp: new Date().toISOString()
  });

  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Validation
    if (!name || !email || !message) {
      console.log('❌ Validation failed: Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('❌ Validation failed: Invalid email format');
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    let savedContact = null;
    let dbConnected = mongoose.connection.readyState === 1;
    
    // Save to database if connected
    if (dbConnected) {
      try {
        const contact = new Contact({
          name,
          email,
          phone: phone || '',
          subject: subject || '',
          message,
          ip: clientIp,
          userAgent: req.headers['user-agent']
        });

        savedContact = await contact.save();
        console.log('💾 Message saved to MongoDB:', savedContact._id);
      } catch (dbError) {
        console.error('❌ Database save error:', dbError.message);
        dbConnected = false;
      }
    } else {
      console.log('⚠️  MongoDB not connected, skipping database save');
    }

    // Send emails
    const emailResult = await sendEmails({
      name,
      email,
      phone: phone || '',
      subject: subject || '',
      message,
      ip: clientIp,
      dbId: savedContact?._id
    });

    const responseTime = Date.now() - startTime;
    
    if (emailResult.success) {
      console.log(`✅ Emails sent via ${emailResult.service}!`);
      console.log(`📤 Admin email: ${emailResult.adminSent ? 'Sent' : 'Failed'}`);
      console.log(`📤 User email: ${emailResult.userSent ? 'Sent' : 'Failed'}`);
      console.log(`⏱️  Response time: ${responseTime}ms`);
      
      // Update contact record if saved
      if (savedContact) {
        savedContact.emailSent = true;
        await savedContact.save();
      }
      
      res.json({
        success: true,
        message: 'Message sent successfully! I will contact you soon.',
        data: {
          savedToDatabase: !!savedContact,
          emailsSent: (emailResult.adminSent ? 1 : 0) + (emailResult.userSent ? 1 : 0),
          emailService: emailResult.service,
          responseTime: `${responseTime}ms`
        }
      });
      
    } else {
      console.log('❌ Email sending failed:', emailResult.error);
      
      if (savedContact) {
        console.log('💾 Message saved to database only (no email sent)');
        res.json({
          success: true,
          message: 'Message received! I will contact you soon.',
          note: 'Emails could not be sent, but message was saved.'
        });
      } else {
        console.log('❌ Message not saved and email failed');
        res.status(500).json({
          success: false,
          message: 'Failed to send message. Please try again later or contact me through social media.',
          responseTime: `${responseTime}ms`
        });
      }
    }

  } catch (error) {
    console.error('❌ Contact form error:', error);
    const responseTime = Date.now() - startTime;
    
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
      responseTime: `${responseTime}ms`
    });
  }
});

// Get all contacts (JSON API)
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ date: -1 }).limit(100);
    res.json({
      success: true,
      count: contacts.length,
      data: contacts
    });
  } catch (error) {
    console.error('❌ Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve contacts'
    });
  }
});

// Admin Panel - View all contacts
app.get('/admin/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ date: -1 });
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Contact Messages Admin - Tahir Abduro</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%);
            color: white;
            min-height: 100vh;
            padding: 20px;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          header { 
            background: rgba(255,255,255,0.1); 
            backdrop-filter: blur(20px);
            border: 1px solid rgba(0,238,255,0.2);
            border-radius: 20px;
            padding: 2rem;
            margin-bottom: 2rem;
            box-shadow: 0 8px 32px 0 rgba(0,238,255,0.2);
          }
          h1 { color: #00eeff; margin-bottom: 10px; }
          .stats { 
            display: flex; 
            gap: 20px; 
            margin: 20px 0;
            flex-wrap: wrap;
          }
          .stat-card {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            border-radius: 10px;
            border: 1px solid rgba(0,238,255,0.1);
          }
          .stat-card h3 { color: #00eeff; font-size: 14px; margin-bottom: 5px; }
          .stat-card p { font-size: 24px; font-weight: bold; }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.1);
          }
          th, td { 
            padding: 15px; 
            text-align: left; 
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          th { 
            background: rgba(0,238,255,0.1); 
            color: #00eeff;
            font-weight: 600;
          }
          tr:hover { background: rgba(255,255,255,0.02); }
          .success { color: #00eeff; }
          .error { color: #ff6b6b; }
          .message-cell { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .message-cell:hover { white-space: normal; overflow: visible; }
          .email-link { color: #00eeff; text-decoration: none; }
          .email-link:hover { text-decoration: underline; }
          .filters { 
            margin: 20px 0; 
            display: flex; 
            gap: 10px; 
            flex-wrap: wrap;
          }
          .filter-btn {
            padding: 8px 16px;
            background: rgba(0,238,255,0.1);
            border: 1px solid rgba(0,238,255,0.3);
            color: white;
            border-radius: 20px;
            cursor: pointer;
            transition: all 0.3s;
          }
          .filter-btn:hover {
            background: rgba(0,238,255,0.2);
            transform: translateY(-2px);
          }
          .filter-btn.active {
            background: #00eeff;
            color: #0a0a0a;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <header>
            <h1>📨 Contact Messages Admin</h1>
            <p>Total messages: ${contacts.length} | Database: <span class="${dbStatus === 'Connected' ? 'success' : 'error'}">${dbStatus}</span> | Email Service: <span class="success">${emailService.toUpperCase()}</span></p>
            
            <div class="stats">
              <div class="stat-card">
                <h3>Today</h3>
                <p>${contacts.filter(c => new Date(c.date).toDateString() === new Date().toDateString()).length}</p>
              </div>
              <div class="stat-card">
                <h3>This Week</h3>
                <p>${contacts.filter(c => {
                  const msgDate = new Date(c.date);
                  const weekAgo = new Date();
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  return msgDate > weekAgo;
                }).length}</p>
              </div>
              <div class="stat-card">
                <h3>Emails Sent</h3>
                <p>${contacts.filter(c => c.emailSent).length}</p>
              </div>
            </div>
          </header>
          
          ${contacts.length === 0 ? 
            '<div style="text-align: center; padding: 40px; background: rgba(255,255,255,0.05); border-radius: 10px;"><h2>No messages yet</h2><p>Contact form messages will appear here</p></div>' : 
            `
            <div class="filters">
              <button class="filter-btn active" onclick="filterMessages('all')">All (${contacts.length})</button>
              <button class="filter-btn" onclick="filterMessages('today')">Today</button>
              <button class="filter-btn" onclick="filterMessages('week')">This Week</button>
              <button class="filter-btn" onclick="filterMessages('month')">This Month</button>
            </div>
            
            <table id="messagesTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Subject</th>
                  <th>Message</th>
                  <th>Email Sent</th>
                </tr>
              </thead>
              <tbody>
                ${contacts.map(contact => `
                  <tr data-date="${contact.date}">
                    <td>${new Date(contact.date).toLocaleString()}</td>
                    <td><strong>${contact.name}</strong></td>
                    <td><a class="email-link" href="mailto:${contact.email}">${contact.email}</a></td>
                    <td>${contact.phone || '-'}</td>
                    <td>${contact.subject || '-'}</td>
                    <td class="message-cell" title="${contact.message}">${contact.message}</td>
                    <td class="${contact.emailSent ? 'success' : 'error'}">${contact.emailSent ? '✅' : '❌'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            `
          }
          
          <div style="margin-top: 30px; padding: 20px; background: rgba(255,255,255,0.05); border-radius: 10px;">
            <h3>📊 System Information</h3>
            <p><strong>Backend URL:</strong> https://portfolio-backend-4-79pt.onrender.com</p>
            <p><strong>Frontend URL:</strong> https://tahir-abduro.netlify.app</p>
            <p><strong>MongoDB:</strong> ${mongoose.connection.host || 'Not connected'}</p>
            <p><strong>Email Service:</strong> ${emailService.toUpperCase()}</p>
            <p><strong>Uptime:</strong> ${Math.floor(process.uptime() / 60)} minutes</p>
            <p style="margin-top: 10px;">
              <a href="/api/contacts" style="color: #00eeff;">View as JSON API</a> | 
              <a href="/api/health" style="color: #00eeff;">Health Check</a> | 
              <a href="https://tahir-abduro.netlify.app" style="color: #00eeff;" target="_blank">Live Portfolio</a>
            </p>
          </div>
        </div>
        
        <script>
          function filterMessages(filter) {
            const rows = document.querySelectorAll('#messagesTable tbody tr');
            const now = new Date();
            
            rows.forEach(row => {
              const date = new Date(row.getAttribute('data-date'));
              let show = false;
              
              switch(filter) {
                case 'today':
                  show = date.toDateString() === now.toDateString();
                  break;
                case 'week':
                  const weekAgo = new Date(now);
                  weekAgo.setDate(weekAgo.getDate() - 7);
                  show = date > weekAgo;
                  break;
                case 'month':
                  const monthAgo = new Date(now);
                  monthAgo.setMonth(monthAgo.getMonth() - 1);
                  show = date > monthAgo;
                  break;
                default:
                  show = true;
              }
              
              row.style.display = show ? '' : 'none';
            });
            
            document.querySelectorAll('.filter-btn').forEach(btn => {
              btn.classList.remove('active');
              if (btn.textContent.includes(filter.charAt(0).toUpperCase() + filter.slice(1))) {
                btn.classList.add('active');
              }
            });
          }
          
          setTimeout(() => location.reload(), 30000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Admin panel error:', error);
    res.status(500).send('Error loading admin panel');
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableRoutes: [
      'GET /api/health',
      'POST /api/contact',
      'GET /api/contacts',
      'GET /admin/contacts'
    ]
  });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  const emailService = process.env.EMAIL_SERVICE || 'sendgrid';
  console.log(`
  🚀 Server running on port ${PORT}
  🌐 CORS enabled for:
     - https://tahir-abduro.netlify.app
  
  📧 Email Service: ${emailService.toUpperCase()}
  
  📊 Available endpoints:
     GET  /api/health     - Health check
     POST /api/contact    - Submit contact form
     GET  /api/contacts   - Get all messages (JSON)
     GET  /admin/contacts - Admin panel (HTML)
  
  ⏰ Server started: ${new Date().toLocaleString()}
  `);
});

