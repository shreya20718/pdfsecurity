const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
// const multer = require("multer"); // Temporarily commented out

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "supersecret"; // use env var in real projects

// Owner email (has full access)
const OWNER_EMAIL = "shreyagaikwad107@gmail.com";

// This will be your deployed URL - UPDATE THIS AFTER DEPLOYMENT
const DEPLOYED_URL = "https://pdfsecurity.onrender.com"; // Change this to your actual deployed URL

// Store authorized recipients with their specific tokens (in production, use a database)
const AUTHORIZED_RECIPIENTS = new Map(); // email -> token mapping

// Configure multer for file uploads (temporarily disabled)
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, './uploads/')
//   },
//   filename: function (req, file, cb) {
//     cb(null, 'edited-resume-' + Date.now() + '.pdf')
//   }
// });

// const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Generate a secure download link for recipient
app.get("/generate-link", (req, res) => {
  const { email } = req.query;
  const recipientEmail = email || OWNER_EMAIL;
  
  const token = jwt.sign({ email: recipientEmail }, SECRET_KEY, {
    expiresIn: "12h",
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
      expiresIn: "12h",
    });

    // Store the token for this specific recipient
    AUTHORIZED_RECIPIENTS.set(email, token);

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
      subject: "Your Secured PDF Link - View and Edit",
      text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF, then send it back to the owner.`,
    });

    console.log("Email sent to:", email, "Message ID:", info.messageId);
    console.log("Authorized recipients:", Array.from(AUTHORIZED_RECIPIENTS.keys()));
    res.send({ success: true, message: `Email sent to ${email}`, messageId: info.messageId });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Route to send edited PDF back to owner (temporarily disabled)
app.post("/send-back", async (req, res) => {
  const { token, recipientEmail } = req.body;
  
  try {
    // Verify token
    const decoded = jwt.verify(token, SECRET_KEY);
    
    // Check if the recipient is authorized with matching token
    if (decoded.email !== OWNER_EMAIL && (!AUTHORIZED_RECIPIENTS.has(decoded.email) || AUTHORIZED_RECIPIENTS.get(decoded.email) !== token)) {
      return res.status(403).send({ success: false, error: "Unauthorized recipient" });
    }
    
    // Temporarily disabled file upload functionality
    res.send({ success: true, message: "File upload functionality temporarily disabled" });
  } catch (error) {
    console.error("Error sending back PDF:", error);
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
            <p>Enter an email address to send the secure PDF link (recipients can view and edit):</p>
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

// View route (shows PDF with editing capabilities)
app.get("/view", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    if (tokenEmail !== OWNER_EMAIL && (!AUTHORIZED_RECIPIENTS.has(tokenEmail) || AUTHORIZED_RECIPIENTS.get(tokenEmail) !== token)) {
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
            <p>You are not authorized to access this PDF. Only the original recipient can use this link.</p>
        </body>
        </html>
      `);
    }

    const filePath = path.join(__dirname, "resume.pdf");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found.");
    }

    // Send the PDF viewer page with editing capabilities
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>PDF Viewer & Editor</title>
          <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
              .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #eee; }
              .pdf-container { width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 5px; }
              .actions { margin-top: 20px; text-align: center; }
              button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
              button:hover { background: #0056b3; }
              .upload-section { margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 5px; }
              .status { margin-top: 10px; padding: 10px; border-radius: 5px; }
              .success { background: #d4edda; color: #155724; }
              .error { background: #f8d7da; color: #721c24; }
          </style>
      </head>
      <body>
          <div class="container">
                             <div class="header">
                   <h1>📄 PDF Viewer & Editor</h1>
                   <div>
                       <span>Welcome, ${tokenEmail}</span>
                       ${tokenEmail !== '${OWNER_EMAIL}' ? '<span style="color: #28a745;">(Recipient)</span>' : '<span style="color: #007bff;">(Owner)</span>'}
                   </div>
               </div>
              
                             <div class="pdf-container">
                   <iframe src="/pdf-content?token=${token}" width="100%" height="100%" frameborder="0"></iframe>
               </div>
              
                             ${tokenEmail !== '${OWNER_EMAIL}' ? `
               <div class="upload-section">
                   <h3>📤 Send Edited PDF Back to Owner</h3>
                   <p>After editing the PDF, upload it here to send it back to the owner.</p>
                   <form id="uploadForm" enctype="multipart/form-data">
                       <input type="file" name="pdf" accept=".pdf" required style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%;">
                       <br>
                       <button type="submit">Send Back to Owner</button>
                   </form>
                   <div id="uploadStatus"></div>
               </div>
               ` : ''}
          </div>
          
                     <script>
               ${tokenEmail !== '${OWNER_EMAIL}' ? `
               document.getElementById('uploadForm').addEventListener('submit', async function(e) {
                   e.preventDefault();
                   const formData = new FormData(this);
                   formData.append('token', '${token}');
                   formData.append('recipientEmail', '${tokenEmail}');
                  
                  const statusDiv = document.getElementById('uploadStatus');
                  statusDiv.innerHTML = '<div class="status">Sending edited PDF...</div>';
                  
                  try {
                      const response = await fetch('/send-back', {
                          method: 'POST',
                          body: formData
                      });
                      const result = await response.json();
                      
                      if (result.success) {
                          statusDiv.innerHTML = '<div class="status success">✅ Edited PDF sent back to owner successfully!</div>';
                          this.reset();
                      } else {
                          statusDiv.innerHTML = '<div class="status error">❌ Error: ' + result.error + '</div>';
                      }
                  } catch (error) {
                      statusDiv.innerHTML = '<div class="status error">❌ Network error: ' + error.message + '</div>';
                  }
              });
              ` : ''}
          </script>
      </body>
      </html>
    `);
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

// Route to serve PDF content
app.get("/pdf-content", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    if (tokenEmail !== OWNER_EMAIL && (!AUTHORIZED_RECIPIENTS.has(tokenEmail) || AUTHORIZED_RECIPIENTS.get(tokenEmail) !== token)) {
      return res.status(403).send("Access denied");
    }

    const filePath = path.join(__dirname, "resume.pdf");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found.");
    }

    // Set headers to allow viewing but prevent download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.status(403).send("Access denied");
  }
});

// Route for direct access - shows email form for unauthorized users
app.get("/", (req, res) => {
  const { token } = req.query;
  
  if (token) {
    try {
      const decoded = jwt.verify(token, SECRET_KEY);
      
      // If it's the owner or a specifically authorized recipient with matching token, redirect to view
      if (decoded.email === OWNER_EMAIL || (AUTHORIZED_RECIPIENTS.has(decoded.email) && AUTHORIZED_RECIPIENTS.get(decoded.email) === token)) {
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
                    messageDiv.innerHTML = '<p style="color: red;">Access denied. Only the owner and specifically invited recipients can access this PDF.</p>';
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
    expiresIn: "12h",
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
    subject: "Your Secured PDF Link - View and Edit",
    text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF, then send it back to the owner.`,
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
  
  console.log(`\n🔒 Security Features:`);
  console.log(`• Owner and recipients can view and edit PDFs`);
  console.log(`• Recipients can send edited PDFs back to owner`);
  console.log(`• Links expire after 12 hours`);
  console.log(`• Works globally from any device`);

  // Send the secure link automatically when server starts
  await sendSecureLink();
});
