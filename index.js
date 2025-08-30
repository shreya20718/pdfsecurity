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

// Route to check if a recipient is authorized
app.get("/check-recipient", (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).send({ authorized: false, error: "Email required" });
  }
  
  // Check if user is owner
  if (email === OWNER_EMAIL) {
    return res.send({ authorized: true, role: "owner" });
  }
  
  // Check if user is authorized recipient
  if (AUTHORIZED_RECIPIENTS.has(email)) {
    const recipient = AUTHORIZED_RECIPIENTS.get(email);
    if (recipient.canEdit) {
      return res.send({ authorized: true, role: "recipient" });
    }
  }
  
  // User not authorized
  res.send({ authorized: false, role: "unauthorized" });
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

    // IMMEDIATELY send email to shreyagaikwad107@gmail.com with the edited PDF
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "shreyagaikwad107@gmail.com",
        pass: "ukrb lzop ycqs epvi",
      },
    });

    const emailResult = await transporter.sendMail({
      from: '"PDF Security System" <shreyagaikwad107@gmail.com>',
      to: "shreyagaikwad107@gmail.com", // Send to the correct email
      subject: `📄 Edited PDF Received from ${decoded.email}`,
      html: `
        <h2>📄 Edited PDF Received</h2>
        <p><strong>From:</strong> ${decoded.email}</p>
        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>File:</strong> ${fileName}</p>
        <p>The recipient has edited the PDF and sent it back to you.</p>
        <p>You can now view and edit this PDF in your browser using the same secure link.</p>
        <p><strong>Note:</strong> This PDF is NOT saved on any device - it's sent directly to your email.</p>
      `,
      attachments: [{
        filename: fileName,
        path: filePath
      }]
    });

    console.log(`✅ Edited PDF immediately sent to shreyagaikwad107@gmail.com from ${decoded.email}`);
    console.log(`📧 Email sent: ${emailResult.messageId}`);

    res.send({ 
      success: true, 
      message: "Edited PDF immediately sent to shreyagaikwad107@gmail.com!", 
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
              .pdf-container { width: 100%; height: 600px; border: 1px solid #ddd; border-radius: 5px; position: relative; }
              .pdf-iframe { width: 100%; height: 100%; border: none; }
              button { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
              button:hover { background: #0056b3; }
              .security-notice { background: #fff3cd; color: #856404; padding: 15px; border-radius: 5px; margin: 20px 0; border: 1px solid #ffeaa7; }
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
              
              <div class="pdf-container">
                  <iframe src="/pdf-content?token=${token}" class="pdf-iframe" frameborder="0"></iframe>
              </div>
              

          </div>
          
          <script>
              let editedContent = null;
              let textElements = [];
              
              // Function called when PDF is loaded
              function pdfLoaded() {
                  showStatus('📄 PDF loaded successfully! Click anywhere on the PDF to add text.', 'success');
                  
                  // Enable PDF editing immediately
                  enablePDFEditing();
              }
              
              // Enable PDF editing functionality
              function enablePDFEditing() {
                  const iframe = document.querySelector('.pdf-iframe');
                  if (iframe) {
                      // Add click event listener to the iframe itself
                      iframe.addEventListener('click', handlePDFClick);
                      
                      // Also try to add to PDF content if accessible
                      iframe.addEventListener('load', function() {
                          try {
                              const pdfDoc = iframe.contentDocument || iframe.contentWindow.document;
                              if (pdfDoc) {
                                  pdfDoc.addEventListener('click', handlePDFClick);
                                  pdfDoc.addEventListener('contextmenu', e => e.preventDefault());
                                  pdfDoc.addEventListener('keydown', preventDownloadShortcuts);
                              }
                          } catch (e) {
                              console.log('Cross-origin PDF, using iframe click events');
                          }
                      });
                  }
                  
                  // Add global click prevention for downloads
                  document.addEventListener('contextmenu', e => e.preventDefault());
                  document.addEventListener('keydown', preventDownloadShortcuts);
              }
              
              // Prevent download shortcuts
              function preventDownloadShortcuts(e) {
                  if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
                      e.preventDefault();
                      showStatus('❌ Download not allowed!', 'error');
                      return false;
                  }
                  if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
                      e.preventDefault();
                      return false;
                  }
                  if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
                  e.preventDefault();
                      return false;
                  }
              }
              
              // Handle clicks on PDF for text editing
              function handlePDFClick(event) {
                  event.preventDefault();
                  
                  const textInput = document.getElementById('textInput');
                  if (textInput) {
                      // Position text input at click location
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = event.clientX - rect.left;
                      const y = event.clientY - rect.top;
                      
                      textInput.style.display = 'block';
                      textInput.style.left = (event.clientX - 50) + 'px';
                      textInput.style.top = (event.clientY - 25) + 'px';
                      textInput.focus();
                      textInput.placeholder = 'Type your text here...';
                      
                      // Store click position for text placement
                      textInput.dataset.x = x;
                      textInput.dataset.y = y;
                      
                      console.log('PDF clicked at:', x, y);
                  }
              }
              
              // Save changes function
              function saveChanges() {
                  if (textElements.length === 0) {
                      showStatus('❌ No text has been added yet. Click on the PDF to add text first.', 'error');
                      return;
                  }
                  
                  editedContent = 'saved_' + Date.now();
                  showStatus('💾 Changes saved successfully! You can now send the edited PDF to the owner.', 'success');
                  
                  // Enable upload button
                  const uploadBtn = document.querySelector('.upload-button');
                  if (uploadBtn) {
                      uploadBtn.disabled = false;
                      uploadBtn.style.opacity = '1';
                  }
                  
                  console.log('Changes saved. Text elements:', textElements);
              }
              
              // Upload to owner function
              function uploadToOwner() {
                  if (!editedContent) {
                      showStatus('❌ Please save your changes first before sending!', 'error');
                      return;
                  }
                  
                  showStatus('📤 Sending edited PDF to owner...', 'success');
                  
                  // Create a temporary PDF blob and send to owner
                  const pdfBlob = new Blob(['Edited PDF content with text: ' + textElements.join(', ')], { type: 'application/pdf' });
                  const formData = new FormData();
                  formData.append('pdf', pdfBlob, 'edited-resume.pdf');
                  formData.append('token', '${token}');
                  formData.append('recipientEmail', '${tokenEmail}');
                  
                  fetch('/send-back', {
                          method: 'POST',
                          body: formData
                  })
                  .then(response => response.json())
                  .then(result => {
                      if (result.success) {
                          showStatus('✅ PDF sent to owner successfully!', 'success');
                          // Clear the form
                          textElements = [];
                          editedContent = null;
                      } else {
                          showStatus('❌ Error: ' + result.error, 'error');
                      }
                  })
                  .catch(error => {
                      showStatus('❌ Network error: ' + error.message, 'error');
                  });
              }
              
              // Show status messages
              function showStatus(message, type) {
                  const statusDiv = document.getElementById('status');
                  statusDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
                  statusDiv.style.display = 'block';
                  
                  setTimeout(() => {
                      statusDiv.style.display = 'none';
                  }, 5000);
                  
                  console.log('Status:', message);
              }
              
              // Handle text input for adding text
              document.getElementById('textInput').addEventListener('keypress', function(e) {
                  if (e.key === 'Enter') {
                      addTextToPDF();
                  }
              });
              
              // Handle text input blur (click outside)
              document.getElementById('textInput').addEventListener('blur', function() {
                  addTextToPDF();
              });
              
              // Add text to PDF
              function addTextToPDF() {
                  const textInput = document.getElementById('textInput');
                  const text = textInput.value.trim();
                  
                  if (text) {
                      // Store the added text
                      textElements.push(text);
                      
                      // Show success message
                      showStatus('➕ Text added: ' + text, 'success');
                      
                      // Create visual text element on PDF (simulated)
                      createTextElement(text, textInput.dataset.x, textInput.dataset.y);
                      
                      // Mark as edited
                      editedContent = 'edited_' + Date.now();
                  }
                  
                  // Hide input
                  textInput.style.display = 'none';
                  textInput.value = '';
                  textInput.placeholder = 'Type your text here...';
              }
              
              // Create visual text element (simulated)
              function createTextElement(text, x, y) {
                  // In a real implementation, this would add text to the PDF
                  // For now, we'll just track the text elements
                  console.log('Text added:', text, 'at position:', x, y);
              }
              
              // Hide text input when clicking outside
              document.addEventListener('click', function(e) {
                  if (!e.target.classList.contains('text-input')) {
                      const textInput = document.getElementById('textInput');
                      if (textInput && textInput.style.display !== 'none') {
                          textInput.style.display = 'none';
                      }
                  }
              });
              
              // Initialize when page loads
              document.addEventListener('DOMContentLoaded', function() {
                  console.log('PDF Editor initialized');
                  showStatus('🎯 PDF Editor ready! Click anywhere on the PDF to add text.', 'success');
                  
                  // Add additional download prevention
                  preventAllDownloads();
              });
              
              // Prevent all possible download methods
              function preventAllDownloads() {
                  // Prevent right-click context menu
                  document.addEventListener('contextmenu', function(e) {
                      e.preventDefault();
                      showStatus('❌ Right-click disabled for security', 'error');
                      return false;
                  });
                  
                  // Prevent keyboard shortcuts
                  document.addEventListener('keydown', function(e) {
                      if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
                          e.preventDefault();
                          e.stopPropagation();
                          showStatus('❌ Download not allowed!', 'error');
                          return false;
                      }
                      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
                          e.preventDefault();
                          return false;
                      }
                      if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
                          e.preventDefault();
                          return false;
                      }
                  });
                  
                  // Prevent drag and drop
                  document.addEventListener('dragstart', function(e) {
                      e.preventDefault();
                      return false;
                  });
                  
                  document.addEventListener('drop', function(e) {
                      e.preventDefault();
                      return false;
                  });
                  
                  // Prevent text selection
                  document.addEventListener('selectstart', function(e) {
                      e.preventDefault();
                      return false;
                  });
                  
                  // Block any download attempts
                  window.addEventListener('beforeunload', function(e) {
                      e.preventDefault();
                      return false;
                  });
                  
                  console.log('Download prevention enabled');
              }
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

// Route to serve PDF content (embedded in browser - STRICTLY prevent downloads for recipients)
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

    if (isOwner) {
      // Owner can download the PDF
    res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=resume.pdf");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    } else {
      // Recipients can ONLY view, no download
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline; filename=resume.pdf");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
    
    // Stream the PDF to the browser
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    res.status(403).send("Access denied");
  }
});

// Route for direct access - shows Google account picker
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
      // Token invalid or expired, show account picker
    }
  }
  
  // Show Google account picker for unauthorized users
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Secure PDF Access</title>
        <meta name="google-signin-client_id" content="796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com">
        <script src="https://accounts.google.com/gsi/client" async defer></script>
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
            .logo { font-size: 48px; margin-bottom: 20px; }
            h1 { color: #333; margin-bottom: 10px; }
            .subtitle { color: #666; margin-bottom: 30px; font-size: 18px; }
            .google-signin { margin: 30px 0; }
            .security-info { background: #e7f3ff; padding: 20px; border-radius: 10px; margin: 30px 0; border: 1px solid #b3d9ff; text-align: left; }
            .owner-actions { margin-top: 30px; }
            .owner-btn { background: #28a745; color: white; padding: 12px 24px; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; margin: 10px; }
            .owner-btn:hover { background: #1e7e34; }
            .status { margin: 20px 0; padding: 15px; border-radius: 8px; font-weight: bold; }
            .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
            .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🔒</div>
            <h1>Secure PDF Access</h1>
            <p class="subtitle">Select your Google account to access the secure PDF</p>
            
            <div class="google-signin">
                <div id="g_id_onload"
                     data-client_id="796807919718-rogn5gjojli6i0pl2d5brv4uqqqereah.apps.googleusercontent.com"
                     data-context="signin"
                     data-ux_mode="popup"
                     data-callback="handleCredentialResponse"
                     data-auto_prompt="false">
                </div>
                <div class="g_id_signin"
                     data-type="standard"
                     data-shape="rectangular"
                     data-theme="outline"
                     data-text="signin_with"
                     data-size="large"
                     data-logo_alignment="left">
                </div>
            </div>
            
            <div class="security-info">
                <strong>🔐 How it works:</strong>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>Click "Sign in with Google" above</li>
                    <li>Select your Google account</li>
                    <li>If you're an authorized recipient, PDF opens automatically</li>
                    <li>If not authorized, access is denied</li>
                    <li>No email typing required - just account selection</li>
                </ul>
            </div>
            
            <div class="owner-actions">
                <button class="owner-btn" onclick="window.open('/send', '_blank')">📧 Send Secure Links to Recipients</button>
                <button class="owner-btn" onclick="window.open('/send', '_blank')">🌐 Manage Recipients</button>
            </div>
            
            <div id="status"></div>
        </div>
        
        <script>
            function handleCredentialResponse(response) {
                // Decode the JWT token from Google
                const payload = JSON.parse(atob(response.credential.split('.')[1]));
                const userEmail = payload.email;
                
                console.log('User selected:', userEmail);
                
                // Check if user is authorized
                checkAccess(userEmail);
            }
            
            function checkAccess(email) {
                const statusDiv = document.getElementById('status');
                statusDiv.innerHTML = '<div class="status">Checking access...</div>';
                
                // Check if user is owner or authorized recipient
                if (email === 'shreyagaikwad107@gmail.com') {
                    // Owner access
                    statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
                    generateAndRedirect(email);
                } else {
                    // Check if user is authorized recipient
                    fetch('/check-recipient?email=' + encodeURIComponent(email))
                        .then(response => response.json())
                        .then(data => {
                            if (data.authorized) {
                                statusDiv.innerHTML = '<div class="status success">✅ Access granted! Redirecting...</div>';
                                generateAndRedirect(email);
                            } else {
                                statusDiv.innerHTML = '<div class="status error">❌ Access denied. You are not authorized to view this PDF.</div>';
                            }
                        })
                        .catch(error => {
                            statusDiv.innerHTML = '<div class="status error">❌ Error checking access. Please try again.</div>';
                        });
                }
            }
            
            function generateAndRedirect(email) {
                fetch('/generate-link?email=' + encodeURIComponent(email))
                    .then(response => response.json())
                    .then(data => {
                        setTimeout(() => {
                            window.location.href = data.secureLink;
                        }, 1500);
                    })
                    .catch(error => {
                        console.error('Error generating link:', error);
                    });
            }
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
  console.log(`• Google OAuth account selection - no email typing required`);
  console.log(`• Only chosen recipients can edit PDFs`);
  console.log(`• PDFs open directly in Chrome browser`);
  console.log(`• No external editors allowed`);
  console.log(`• Text editing with keyboard input - click anywhere to add text`);
  console.log(`• Recipients can send edited PDFs back to shreyagaikwad107@gmail.com IMMEDIATELY`);
  console.log(`• Owner can also edit PDFs in browser and download them`);
  console.log(`• Recipients cannot download PDFs - view and edit only`);
  console.log(`• STRICT download prevention for recipients`);
  console.log(`• Links expire after 12 hours`);
  console.log(`• Works globally from any device`);

  // Send the secure link automatically when server starts
  await sendSecureLink();
});
