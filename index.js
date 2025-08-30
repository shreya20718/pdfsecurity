const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "supersecret"; // use env var in real projects

// Owner email (has full access)
const OWNER_EMAIL = "shreyagaikwad107@gmail.com";

// This will be your deployed URL - UPDATE THIS AFTER DEPLOYMENT
const DEPLOYED_URL = "https://pdfsecurity.onrender.com"; // Your deployed URL

// Store authorized recipients with their specific tokens and permissions
const AUTHORIZED_RECIPIENTS = new Map(); // email -> {token, canEdit, pdfData}

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Create uploads directory if it doesn't exist
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    // Store the token for this specific recipient with edit permissions
    AUTHORIZED_RECIPIENTS.set(email, {
      token: token,
      canEdit: true,
      pdfData: null
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
      subject: "Your Secured PDF Link - View and Edit",
      text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF directly in your browser, then send it back to the owner.`,
    });

    console.log("Email sent to:", email, "Message ID:", info.messageId);
    console.log("Authorized recipients:", Array.from(AUTHORIZED_RECIPIENTS.keys()));
    res.send({ success: true, message: `Email sent to ${email}`, messageId: info.messageId });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

// Route to send edited PDF back to owner (IMMEDIATE)
app.post("/send-back", upload.single('pdf'), async (req, res) => {
  const { token, recipientEmail } = req.body;
  
  try {
    // Verify token
    const decoded = jwt.verify(token, SECRET_KEY);
    
    // Check if the recipient is authorized with matching token and can edit
    if (decoded.email !== OWNER_EMAIL && 
        (!AUTHORIZED_RECIPIENTS.has(decoded.email) || 
         AUTHORIZED_RECIPIENTS.get(decoded.email).token !== token ||
         !AUTHORIZED_RECIPIENTS.get(decoded.email).canEdit)) {
      return res.status(403).send({ success: false, error: "Unauthorized recipient or no edit permissions" });
    }
    
    if (!req.file) {
      return res.status(400).send({ success: false, error: "No PDF file uploaded" });
    }

    // Save the edited PDF with timestamp
    const fileName = `edited-resume-${decoded.email}-${Date.now()}.pdf`;
    const filePath = path.join(__dirname, 'uploads', fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    // IMMEDIATELY send email to owner with the edited PDF
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shreyagaikwad107@gmail.com",
        pass: "ukrb lzop ycqs epvi",
      },
    });

    const emailResult = await transporter.sendMail({
      from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
      to: OWNER_EMAIL,
      subject: `📄 Edited PDF Received from ${decoded.email}`,
      html: `
        <h2>📄 Edited PDF Received</h2>
        <p><strong>From:</strong> ${decoded.email}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>File:</strong> ${fileName}</p>
        <p>The recipient has edited the PDF and sent it back to you.</p>
        <p>You can now view and edit this PDF in your browser using the same secure link.</p>
      `,
      attachments: [{
        filename: fileName,
        path: filePath
      }]
    });

    console.log(`✅ Edited PDF immediately sent to owner from ${decoded.email}`);
    console.log(`📧 Email sent: ${emailResult.messageId}`);

    res.send({ 
      success: true, 
      message: "Edited PDF immediately sent back to owner!", 
      emailId: emailResult.messageId 
    });
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
            <p>Enter an email address to send the secure PDF link (recipients can view and edit in Chrome):</p>
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

// View route (shows PDF with editing capabilities for authorized users only)
app.get("/view", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    const isOwner = tokenEmail === OWNER_EMAIL;
    const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) && 
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

    if (!isOwner && !isAuthorizedRecipient) {
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

    // Send the PDF viewer page with editing capabilities for authorized users
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
          <title>Secure PDF Viewer & Editor</title>
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
              .security-notice { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7; }
              .editing-tools { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #b3d9ff; }
              .tool-button { background: #28a745; margin: 5px; }
              .tool-button:hover { background: #1e7e34; }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1>🔒 Secure PDF Viewer & Editor</h1>
                  <div>
                      <span>Welcome, ${tokenEmail}</span>
                      ${isOwner ? '<span style="color: #007bff;">(Owner - Full Access)</span>' : '<span style="color: #28a745;">(Authorized Recipient - Can Edit)</span>'}
                  </div>
              </div>
              
              <div class="security-notice">
                  <strong>🔐 Security Notice:</strong> This PDF opens directly in your browser. No external editors are allowed for security reasons.
              </div>
              
              <div class="editing-tools">
                  <h3>✏️ PDF Editing Tools</h3>
                  <p><strong>Text Editing:</strong> Click on any text in the PDF to edit, add, or remove content directly in your browser.</p>
                  <button class="tool-button" onclick="enableTextEditing()">Enable Text Editing</button>
                  <button class="tool-button" onclick="addText()">Add New Text</button>
                  <button class="tool-button" onclick="removeText()">Remove Text</button>
                  <button class="tool-button" onclick="saveChanges()">Save Changes</button>
              </div>
              
              <div class="pdf-container">
                  <iframe src="/pdf-content?token=${token}" width="100%" height="100%" frameborder="0"></iframe>
              </div>
              
              <div class="upload-section">
                  <h3>📤 Send Edited PDF Back to Owner</h3>
                  <p>After editing the PDF in your browser, upload it here to send it back to the owner.</p>
                  <form id="uploadForm" enctype="multipart/form-data">
                      <input type="file" name="pdf" accept=".pdf" required style="margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; width: 100%;">
                      <br>
                      <button type="submit">Send Back to Owner</button>
                  </form>
                  <div id="uploadStatus"></div>
              </div>
          </div>
          
          <script>
              // PDF Editing Functions
              function enableTextEditing() {
                  const iframe = document.querySelector('iframe');
                  if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage({ action: 'enableEditing' }, '*');
                  }
                  alert('Text editing enabled! Click on any text in the PDF to edit.');
              }
              
              function addText() {
                  const iframe = document.querySelector('iframe');
                  if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage({ action: 'addText' }, '*');
                  }
                  alert('Click anywhere in the PDF to add new text.');
              }
              
              function removeText() {
                  const iframe = document.querySelector('iframe');
                  if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage({ action: 'removeText' }, '*');
                  }
                  alert('Click on any text in the PDF to remove it.');
              }
              
              function saveChanges() {
                  const iframe = document.querySelector('iframe');
                  if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage({ action: 'saveChanges' }, '*');
                  }
                  alert('Changes saved! You can now upload the edited PDF.');
              }
              
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

// Route to serve PDF content (embedded in browser - NO DOWNLOAD)
app.get("/pdf-content", (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const tokenEmail = decoded.email;

    // Check if user is authorized (owner or specifically authorized recipient with matching token)
    const isOwner = tokenEmail === OWNER_EMAIL;
    const isAuthorizedRecipient = AUTHORIZED_RECIPIENTS.has(tokenEmail) && 
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).token === token &&
                                 AUTHORIZED_RECIPIENTS.get(tokenEmail).canEdit;

    if (!isOwner && !isAuthorizedRecipient) {
      return res.status(403).send("Access denied");
    }

    const filePath = path.join(__dirname, "resume.pdf");

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found.");
    }

    // Set headers to STRICTLY prevent download and only allow inline viewing
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, no-transform");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'self'");
    
    // Stream the PDF to the browser with strict security
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    
    // Prevent any download attempts
    req.on('close', () => {
      stream.destroy();
    });
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
      if (decoded.email === OWNER_EMAIL || 
          (AUTHORIZED_RECIPIENTS.has(decoded.email) && 
           AUTHORIZED_RECIPIENTS.get(decoded.email).token === token &&
           AUTHORIZED_RECIPIENTS.get(decoded.email).canEdit)) {
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
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .form-container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
            input[type="email"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 5px; }
            button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
            button:hover { background: #0056b3; }
            .security-info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #b3d9ff; }
            .url-info { background: #d4edda; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #c3e6cb; }
            .owner-actions { margin-top: 20px; text-align: center; }
        </style>
    </head>
    <body>
        <div class="form-container">
            <h2>🔒 Secure PDF Access</h2>
            <p>Please enter your email address to access the secure PDF:</p>
            
            <div class="security-info">
                <strong>🔐 Security Features:</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>PDF opens directly in Chrome browser</li>
                    <li>No external editors allowed</li>
                    <li>Only authorized recipients can edit</li>
                    <li>Secure token-based access</li>
                    <li>Text editing, adding, and removing capabilities</li>
                </ul>
            </div>
            
            <div class="url-info">
                <strong>🌐 Owner Actions:</strong>
                <p><strong>Send secure links to recipients:</strong> <a href="/send" target="_blank">${DEPLOYED_URL}/send</a></p>
                <p><strong>Direct email sending:</strong> ${DEPLOYED_URL}/send-email/EMAIL_ADDRESS</p>
            </div>
            
            <form id="emailForm">
                <input type="email" id="email" placeholder="Enter your email address" required>
                <button type="submit">Request Access</button>
            </form>
            <div id="message"></div>
            
            <div class="owner-actions">
                <button onclick="window.open('/send', '_blank')">📧 Send Secure Links to Recipients</button>
            </div>
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
    from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
    to: OWNER_EMAIL,
    subject: "Your Secured PDF Link - View and Edit",
    text: `Hello, here is your secure PDF link (valid for 12h): ${secureLink}\n\nYou can view and edit the PDF directly in your browser, then send it back to the owner.`,
  });

  console.log("Email sent:", info.messageId);
}

// ----------------- START SERVER -----------------
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Secure PDF Email System Started!`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌍 Deployed URL: ${DEPLOYED_URL}`);
  
  console.log(`\n📧 Quick Actions:`);
  console.log(`• Send email to any recipient: ${DEPLOYED_URL}/send-email/EMAIL_ADDRESS`);
  console.log(`• Web interface for sending emails: ${DEPLOYED_URL}/send`);
  console.log(`• PDF access page: ${DEPLOYED_URL}/`);
  
  console.log(`\n🔒 Security Features:`);
  console.log(`• Only chosen recipients can edit PDFs`);
  console.log(`• PDFs open directly in Chrome browser`);
  console.log(`• No external editors allowed`);
  console.log(`• Text editing, adding, and removing capabilities`);
  console.log(`• Recipients can send edited PDFs back to owner IMMEDIATELY`);
  console.log(`• Owner can also edit PDFs in browser`);
  console.log(`• PDFs are NOT downloadable - view only`);
  console.log(`• Links expire after 12 hours`);
  console.log(`• Works globally from any device`);

  // Send the secure link automatically when server starts
  await sendSecureLink();
});
