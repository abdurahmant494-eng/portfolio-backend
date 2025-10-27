const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
// Middleware
// Middleware
app.use(cors({
  origin: [
    'https://dazzling-stroopwafel-cf7c2e.netlify.app', // ← NEW DOMAIN
    'https://mellow-granita-7013c6.netlify.app',       // ← OLD DOMAIN
    'http://localhost:3000', 
    'http://127.0.0.1:5500'
  ],
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));



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

// Contact form endpoint with SendGrid
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

    // Send email notification using SendGrid
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      // Email to you (notification)
      const adminMsg = {
        to: process.env.EMAIL_USER, // Your email
        from: process.env.EMAIL_USER, // Verified sender in SendGrid
        subject: `📧 New Portfolio Message: ${subject || 'No Subject'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #00eeff;">New Contact Form Submission</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px;">
              <p><strong>Name:</strong> ${name}</p>
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
              <p><strong>Subject:</strong> ${subject || 'No subject'}</p>
              <p><strong>Message:</strong></p>
              <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #00eeff;">
                ${message}
              </div>
            </div>
            <p style="margin-top: 20px; color: #666;">
              This message was sent from your portfolio website at ${new Date().toLocaleString()}
            </p>
          </div>
        `
      };

      // Auto-reply to the person who contacted you
      const userMsg = {
        to: email,
        from: process.env.EMAIL_USER,
        subject: 'Thank you for contacting me!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #00eeff;">Thank You for Your Message!</h2>
            <p>Dear <strong>${name}</strong>,</p>
            <p>I have received your message and will get back to you as soon as possible.</p>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p><strong>Your Message:</strong></p>
              <div style="background: white; padding: 15px; border-radius: 5px;">
                ${message}
              </div>
            </div>
            <p>Best regards,<br><strong>Tahir Abduro</strong></p>
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated response. Please do not reply to this email.
            </p>
          </div>
        `
      };

      // Send both emails
      await sgMail.send(adminMsg);
      await sgMail.send(userMsg);

      console.log('Emails sent successfully via SendGrid');
      
      res.json({ 
        success: true, 
        message: 'Message sent successfully! I will contact you soon.' 
      });

    } catch (emailError) {
      console.log('SendGrid email failed, but message saved to database:', emailError.message);
      // Still success because data was saved
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
});// Get all contacts (for admin view)
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
