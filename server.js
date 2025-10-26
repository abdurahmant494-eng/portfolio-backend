const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

// Middleware
// Middleware
// Middleware
app.use(cors({
  origin: ['https://mellow-granita-7013c6.netlify.app', 'http://localhost:3000', 'http://127.0.0.1:5500'],
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

// Email transporter setup - FIXED: createTransport (not createTransporter)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Test email connection
transporter.verify((error, success) => {
  if (error) {
    console.log('Email configuration error:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Simple Contact Schema
const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  subject: String,
  message: String,
  date: { type: Date, default: Date.now }
});

const Contact = mongoose.model('Contact', contactSchema);

// Routes
// Health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running!', status: 'OK' });
});

// Contact form endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and message are required' 
      });
    }

    // Save to database
    const contact = new Contact({
      name,
      email,
      phone: phone || '',
      subject: subject || '',
      message
    });

    await contact.save();

    // Try to send emails, but don't fail if they timeout
    try {
      // Send email notification to you
      const adminMailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: `📧 New Portfolio Message: ${subject || 'No Subject'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ef;">New Contact Form Submission</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
              <p><strong>Subject:</strong> ${subject || 'No subject'}</p>
              <p><strong>Message:</strong></p>
              <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #0ef;">
                ${message}
              </div>
            </div>
            <p style="margin-top: 20px; color: #666;">
              This message was sent from your portfolio website at ${new Date().toLocaleString()}
            </p>
          </div>
        `
      };

      // Send auto-reply
      const userMailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Thank you for contacting me!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ef;">Thank You for Your Message!</h2>
            <p>Dear <strong>${name}</strong>,</p>
            <p>I have received your message and will get back to you as soon as possible.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p><strong>Your Message:</strong></p>
              <div style="background: white; padding: 15px; border-radius: 5px;">
                ${message}
              </div>
            </div>
            <p>Best regards,<br><strong>Tahir Abduro</strong></p>
          </div>
        `
      };

      await transporter.sendMail(adminMailOptions);
      await transporter.sendMail(userMailOptions);
      
      res.json({ 
        success: true, 
        message: 'Message sent successfully! I will contact you soon.' 
      });
      
    } catch (emailError) {
      // Email failed but data was saved
      console.log('Email sending failed, but message saved to database');
      res.json({ 
        success: true, 
        message: 'Message received! I will contact you soon.' 
      });
    }

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error. Please try again later.' 
    });
  }
});
// Get all contacts (for admin view)
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ date: -1 });
    res.json({ success: true, data: contacts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
 

