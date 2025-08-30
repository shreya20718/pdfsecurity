const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "supersecret"; // use env var in real projects

// Owner email (has full access)
const OWNER_EMAIL = "shreyagaikwad107@gmail.com";

// This will be your deployed URL - UPDATE THIS AFTER DEPLOYMENT
const DEPLOYED_URL = "https://your-app-name.onrender.com"; // Change this to your actual deployed URL

// Generate a secure download link for recipient
app.get("/generate-link", (req, res) => {
  const { email } = req.query;
  const recipientEmail = email || OWNER_EMAIL;
  
  const token = jwt.sign({ email: recipientEmail }, SECRET_KEY, {
    expiresIn: "24h",
  });

  const link = `${DEPLOYED_URL}/view?token=${token}`;
  
  res.send({ secureLink: link });
});

// Route to send email to any recipient
app.get("/send-email/:email", async (req, res) => {
  const email = req.params.email;
  
  try {
    // Create token for the specified email
    const token = jwt.sign({ email: email }, SECRET_KEY, {
      expiresIn: "24h",
    });

    const secureLink = `${DEPLOYED_URL}/view?token=${token}`;

    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shreyagaikwad107@gmail.com",
        pass: "ukrb lzop ycqs epvi",
      },
    });

    let info = await transporter.sendMail({
      from: '"Shreya Gaikwad" <shreyagaikwad107@gmail.com>',
      to: email,
      subject: "Your Secured PDF Link",
      text: `Hello, here is your secure PDF link (valid for 24h): ${secureLink}`,
    });

    console.log("Email sent to:", email, "Message ID:", info.messageId);
    res.send({ success: true, message: `Email sent to ${email}`, messageId: info.messageId });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Web interface for sending emails
app.get("/send", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Send Secure PDF Link</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            input[type="email"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background: #0056b3; }
            .status { margin-top: 20px; padding: 10px; border-radius: 5px; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>📧 Send Secure PDF Link</h2>
            <p>Enter an email address to send the secure PDF link:</p>
            <form id="emailForm">
                <input type="email" id="email" placeholder="Enter email address" required>
                <button type="submit">Send Email</button>
            </form>
            <div id="status"></div>
            
            <hr style="margin: 30px 0;">
            <h3>Quick Actions:</h3>
            <button onclick="sendToOwner()">Send to Owner</button>
            <button onclick="window.location.href='/'">View PDF Access Page</button>
        </div>
        
        <script>
            document.getElementById('emailForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const statusDiv = document.getElementById('status');
                
                statusDiv.innerHTML = '<div class="status">Sending email...</div>';
                
                try {
                    const response = await fetch('/send-email/' + encodeURIComponent(email));
                    const result = await response.json();
                    
                    if (result.success) {
                        statusDiv.innerHTML = '<div class="status success">✅ Email sent successfully to ' + email + '</div>';
                        document.getElementById('email').value = '';
                    } else {
                        statusDiv.innerHTML = '<div class="status error">❌ Error: ' + result.error + '</div>';
                    }
                } catch (error) {
                    statusDiv.innerHTML = '<div class="status error">❌ Network error: ' + error.message + '</div>';
                }
            });
            
            async function sendToOwner() {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = '<div class="status">Sending email to owner...</div>';
                
                try {
                    const response = await fetch('/send-email/${OWNER_EMAIL}');
                    const result = await response.json();
                    
                    if (result.success) {
                        statusDiv.innerHTML = '<div class="status success">✅ Email sent successfully to ${OWNER_EMAIL}</div>';
                    } else {
                        statusDiv.innerHTML = '<div class="status error">❌ Error: ' + result.error + '</div>';
                    }
                } catch (error) {
                    statusDiv.innerHTML = '<div class="status error">❌ Network error: ' + error.message + '</div>';
                }
            }
        </script>
    </body>
    </html>
  `);
});

// View route (shows PDF without download option)
app.get("/view", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const email = decoded.email;

    // Check if user is authorized (owner has full access)
    if (email !== OWNER_EMAIL) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Access Denied</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1 class="error">Access Denied</h1>
            <p>Only the owner (${OWNER_EMAIL}) has access to this PDF.</p>
        </body>
        </html>
      `);
    }

    const filePath = path.join(__dirname, "resume.pdf");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found.");
    }

    // Set headers to prevent download and force inline viewing
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    
    // Disable right-click and other download methods
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Access Denied</title>
          <style>
              body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
              .error { color: red; }
          </style>
      </head>
      <body>
          <h1 class="error">Access Denied</h1>
          <p>Invalid or expired link.</p>
      </body>
      </html>
    `);
  }
});

// Route for direct access - shows email form for unauthorized users
app.get("/", (req, res) => {
  const { token } = req.query;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      
      // If it's the owner, redirect to view
      if (decoded.email === OWNER_EMAIL) {
        return res.redirect(`/view?token=${token}`);
      }
    } catch (err) {
      // Token invalid or expired, show email form
    }
  }
  
  // Show email form for unauthorized users
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Secure PDF Access</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 500px; margin: 50px auto; padding: 20px; }
            .form-container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            input[type="email"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
            button:hover { background: #0056b3; }
        </style>
    </head>
    <body>
        <div class="form-container">
            <h2>Secure PDF Access</h2>
            <p>Please enter your email address to access the secure PDF:</p>
            <form id="emailForm">
                <input type="email" id="email" placeholder="Enter your email address" required>
                <button type="submit">Request Access</button>
            </form>
            <div id="message"></div>
        </div>
        
        <script>
            document.getElementById('emailForm').addEventListener('submit', function(e) {
                e.preventDefault();
                const email = document.getElementById('email').value;
                const messageDiv = document.getElementById('message');
                
                if (email === '${OWNER_EMAIL}') {
                    messageDiv.innerHTML = '<p style="color: green;">Access granted! Redirecting...</p>';
                    // Generate a new token and redirect
                    fetch('/generate-link?email=' + encodeURIComponent(email))
                        .then(response => response.json())
                        .then(data => {
                            window.location.href = data.secureLink;
                        });
                } else {
                    messageDiv.innerHTML = '<p style="color: red;">Access denied. Only the owner can access this PDF.</p>';
                }
            });
        </script>
    </body>
    </html>
  `);
});

// ----------------- EMAIL SENDER -----------------
async function sendSecureLink() {
  // Create token
  const token = jwt.sign({ email: OWNER_EMAIL }, SECRET_KEY, {
    expiresIn: "24h",
  });

  const secureLink = `${DEPLOYED_URL}/view?token=${token}`;

  let transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "shreyagaikwad107@gmail.com",
      pass: "ukrb lzop ycqs epvi",
    },
  });

  let info = await transporter.sendMail({
    from: '"Shreya Gaikwad" <shreyagaikwad107@gmail.com>',
    to: OWNER_EMAIL,
    subject: "Your Secured PDF Link",
    text: `Hello, here is your secure PDF link (valid for 24h): ${secureLink}`,
  });

  console.log("Email sent:", info.messageId);
}

// ----------------- START SERVER -----------------
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server started successfully!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Deployed URL: ${DEPLOYED_URL}`);
  
  console.log(`\n📧 Quick Actions:`);
  console.log(`• Send email to any recipient: ${DEPLOYED_URL}/send-email/EMAIL_ADDRESS`);
  console.log(`• Web interface for sending emails: ${DEPLOYED_URL}/send`);
  console.log(`• PDF access page: ${DEPLOYED_URL}/`);
  
  console.log(`\n💡 After deployment:`);
  console.log(`1. Update DEPLOYED_URL in the code with your actual URL`);
  console.log(`2. Redeploy the application`);
  console.log(`3. Your links will work globally!`);

  // Send the secure link automatically when server starts
  await sendSecureLink();
});
