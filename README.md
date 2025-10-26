# Portfolio Backend API

Backend server for my personal portfolio website with contact form functionality.

## Features

- Contact form API endpoint
- MongoDB database integration
- Email notifications
- Auto-reply to users
- CORS enabled

## API Endpoints

- `POST /api/contact` - Submit contact form
- `GET /api/health` - Health check
- `GET /api/contacts` - Get all contacts (admin)

## Environment Variables

Create a `.env` file with:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
CLIENT_URL=http://localhost:3000